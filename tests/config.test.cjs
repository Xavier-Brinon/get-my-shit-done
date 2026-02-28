/**
 * GMSD Tools Tests - Config gitignore sync
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

describe('config-set commit_docs gitignore sync', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Create a minimal config.json
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }, null, 2),
      'utf-8'
    );
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('setting commit_docs to false adds .planning/ to .gitignore', () => {
    const result = runGsdTools('config-set commit_docs false', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const gitignorePath = path.join(tmpDir, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore should exist');

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content.includes('.planning/'), '.gitignore should contain .planning/');
  });

  test('setting commit_docs to true removes .planning/ from .gitignore', () => {
    // Start with .planning/ in .gitignore
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      'node_modules/\n.planning/\n.env\n',
      'utf-8'
    );

    const result = runGsdTools('config-set commit_docs true', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(!content.includes('.planning/'), '.gitignore should not contain .planning/');
    assert.ok(content.includes('node_modules/'), 'other entries should be preserved');
    assert.ok(content.includes('.env'), 'other entries should be preserved');
  });

  test('setting commit_docs to false twice does not duplicate entry', () => {
    runGsdTools('config-set commit_docs false', tmpDir);
    runGsdTools('config-set commit_docs false', tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.split('\n').filter((line) => line.trim() === '.planning/');
    assert.strictEqual(matches.length, 1, 'should have exactly one .planning/ entry');
  });

  test('setting commit_docs to true when not in .gitignore is a no-op', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      'node_modules/\n.env\n',
      'utf-8'
    );
    const before = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');

    const result = runGsdTools('config-set commit_docs true', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const after = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.strictEqual(before, after, '.gitignore should be unchanged');
  });

  test('creates .gitignore if it does not exist', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    assert.ok(!fs.existsSync(gitignorePath), '.gitignore should not exist initially');

    runGsdTools('config-set commit_docs false', tmpDir);

    assert.ok(fs.existsSync(gitignorePath), '.gitignore should be created');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(content.includes('.planning/'), '.gitignore should contain .planning/');
  });

  test('preserves other .gitignore entries when adding', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      'node_modules/\n.env\ndist/\n',
      'utf-8'
    );

    runGsdTools('config-set commit_docs false', tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('node_modules/'), 'should preserve node_modules/');
    assert.ok(content.includes('.env'), 'should preserve .env');
    assert.ok(content.includes('dist/'), 'should preserve dist/');
    assert.ok(content.includes('.planning/'), 'should add .planning/');
  });

  test('treats .planning and .planning/ as equivalent in .gitignore', () => {
    // Existing entry without trailing slash
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      '.planning\n',
      'utf-8'
    );

    runGsdTools('config-set commit_docs false', tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.split('\n').filter((line) => line.trim().replace(/\/+$/, '') === '.planning');
    assert.strictEqual(matches.length, 1, 'should not duplicate when trailing slash differs');
  });

  test('removes .planning without trailing slash when setting true', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      'node_modules/\n.planning\n',
      'utf-8'
    );

    runGsdTools('config-set commit_docs true', tmpDir);

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(!content.includes('.planning'), '.planning should be removed');
    assert.ok(content.includes('node_modules/'), 'other entries preserved');
  });

  test('returns gitignore_synced in JSON output', () => {
    const result = runGsdTools('config-set commit_docs false', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const parsed = JSON.parse(result.output);
    assert.strictEqual(parsed.gitignore_synced, true);
    assert.strictEqual(parsed.value, false);
  });
});

describe('config-ensure-section gitignore sync', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
    // Remove the config.json that createTempProject might leave
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates .gitignore entry when user defaults set commit_docs false', () => {
    // Isolate from real ~/.gmsd by overriding HOME
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gmsd-home-'));

    try {
      process.env.HOME = fakeHome;
      const gmsdDir = path.join(fakeHome, '.gmsd');
      const defaultsPath = path.join(gmsdDir, 'defaults.json');

      fs.mkdirSync(gmsdDir, { recursive: true });
      fs.writeFileSync(
        defaultsPath,
        JSON.stringify({ commit_docs: false }, null, 2),
        'utf-8'
      );

      // Remove .planning dir so ensure-section creates fresh config
      fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true, force: true });

      runGsdTools('config-ensure-section', tmpDir);

      const gitignorePath = path.join(tmpDir, '.gitignore');
      assert.ok(fs.existsSync(gitignorePath), '.gitignore should be created');

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      assert.ok(content.includes('.planning/'), '.gitignore should contain .planning/');
    } finally {
      process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
