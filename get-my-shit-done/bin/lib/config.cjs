/**
 * Config — Planning config CRUD operations
 */

const fs = require('fs');
const path = require('path');
const { output, error } = require('./core.cjs');

const GITIGNORE_ENTRY = '.planning/';

function normalizeGitignoreEntry(value) {
  return value.trim().replace(/\/+$/, '');
}

function ensureGitignoreEntry(cwd, entry) {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';
  try {
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }
  } catch { /* proceed with empty */ }

  const normalizedEntry = normalizeGitignoreEntry(entry);
  const lines = content.split('\n');
  if (lines.some((line) => normalizeGitignoreEntry(line) === normalizedEntry)) {
    return false;
  }

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(gitignorePath, content + separator + entry + '\n', 'utf-8');
  return true;
}

function removeGitignoreEntry(cwd, entry) {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return false;
  }

  let content;
  try {
    content = fs.readFileSync(gitignorePath, 'utf-8');
  } catch {
    return false;
  }

  const normalizedEntry = normalizeGitignoreEntry(entry);
  const lines = content.split('\n');
  const filtered = lines.filter((line) => normalizeGitignoreEntry(line) !== normalizedEntry);

  if (filtered.length === lines.length) {
    return false;
  }

  fs.writeFileSync(gitignorePath, filtered.join('\n'), 'utf-8');
  return true;
}

function syncGitignore(cwd, commitDocs) {
  if (commitDocs) {
    return removeGitignoreEntry(cwd, GITIGNORE_ENTRY);
  } else {
    return ensureGitignoreEntry(cwd, GITIGNORE_ENTRY);
  }
}

function cmdConfigEnsureSection(cwd, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Detect Brave Search API key availability
  const homedir = require('os').homedir();
  const braveKeyFile = path.join(homedir, '.gmsd', 'brave_api_key');
  const hasBraveSearch = !!(process.env.BRAVE_API_KEY || fs.existsSync(braveKeyFile));

  // Load user-level defaults from ~/.gmsd/defaults.json if available
  const globalDefaultsPath = path.join(homedir, '.gmsd', 'defaults.json');
  let userDefaults = {};
  try {
    if (fs.existsSync(globalDefaultsPath)) {
      userDefaults = JSON.parse(fs.readFileSync(globalDefaultsPath, 'utf-8'));
    }
  } catch (err) {
    // Ignore malformed global defaults, fall back to hardcoded
  }

  // Create default config (user-level defaults override hardcoded defaults)
  const hardcoded = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'gmsd/phase-{phase}-{slug}',
    milestone_branch_template: 'gmsd/{milestone}-{slug}',
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
      nyquist_validation: false,
    },
    parallelization: true,
    brave_search: hasBraveSearch,
  };
  const defaults = {
    ...hardcoded,
    ...userDefaults,
    workflow: { ...hardcoded.workflow, ...(userDefaults.workflow || {}) },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }

  try {
    if (!defaults.commit_docs) {
      syncGitignore(cwd, false);
    }
  } catch (err) {
    error('.gitignore sync failed: ' + err.message);
  }

  const result = { created: true, path: '.planning/config.json' };
  output(result, raw, 'created');
}

function cmdConfigSet(cwd, keyPath, value, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }

  // Sync .gitignore when commit_docs changes
  const isCommitDocs =
    keyPath === 'commit_docs' || keyPath === 'planning.commit_docs';
  let gitignoreSynced = false;
  if (isCommitDocs && typeof parsedValue === 'boolean') {
    try {
      gitignoreSynced = syncGitignore(cwd, parsedValue);
    } catch (err) {
      error('.gitignore sync failed: ' + err.message);
    }
  }

  const result = { updated: true, key: keyPath, value: parsedValue, gitignore_synced: gitignoreSynced };
  output(result, raw, `${keyPath}=${parsedValue}`);
}

function cmdConfigGet(cwd, keyPath, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-get <key.path>');
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      error('No config.json found at ' + configPath);
    }
  } catch (err) {
    if (err.message.startsWith('No config.json')) throw err;
    error('Failed to read config.json: ' + err.message);
  }

  // Traverse dot-notation path (e.g., "workflow.auto_advance")
  const keys = keyPath.split('.');
  let current = config;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      error(`Key not found: ${keyPath}`);
    }
    current = current[key];
  }

  if (current === undefined) {
    error(`Key not found: ${keyPath}`);
  }

  output(current, raw, String(current));
}

module.exports = {
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigGet,
  syncGitignore,
};
