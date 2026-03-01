/**
 * GMSD Todos — Single-file TODOS.org with native org-mode features
 *
 * Architecture: parser layer (pure) → mutation layer (pure) → command layer (I/O)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FILES, DOC_EXT, output, error, safeReadFile } = require('./core.cjs');

// ─── Constants ───────────────────────────────────────────────────────────────

const TODO_STATES = ['TODO', 'NEXT', 'WAITING'];
const DONE_STATES = ['DONE', 'CANCELLED'];
const ALL_STATES = [...TODO_STATES, ...DONE_STATES];
const PRIORITIES = ['A', 'B', 'C'];

// ─── Parser Layer (pure, no I/O) ─────────────────────────────────────────────

/**
 * Format a Date as an org-mode inactive timestamp: [YYYY-MM-DD Ddd]
 */
function orgDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `[${yyyy}-${mm}-${dd} ${days[d.getDay()]}]`;
}

/**
 * Format a Date as an org-mode active timestamp: <YYYY-MM-DD Ddd>
 */
function orgActiveDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `<${yyyy}-${mm}-${dd} ${days[d.getDay()]}>`;
}

/**
 * Format a Date as an org-mode inactive timestamp with time: [YYYY-MM-DD Ddd HH:MM]
 * Used in LOGBOOK entries and CLOSED timestamps that need time precision.
 */
function orgDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `[${yyyy}-${mm}-${dd} ${days[d.getDay()]} ${hh}:${min}]`;
}

/**
 * Parse a single ** level todo entry from its text block.
 * Returns structured object with all fields.
 */
function parseTodoEntry(text) {
  const lines = text.split('\n');
  const headline = lines[0];

  // Parse headline: ** STATE [#P] Title                     :tag:
  const headlineMatch = headline.match(
    /^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)\s+(?:\[#([ABC])\]\s+)?(.+?)(?:\s+:([^:]+(?::[^:]+)*):)?\s*$/
  );
  if (!headlineMatch) return null;

  const state = headlineMatch[1];
  const priority = headlineMatch[2] || null;
  const title = headlineMatch[3].trim();
  const area = headlineMatch[4] || null;

  // Parse planning line (SCHEDULED, DEADLINE, CLOSED)
  let scheduled = null;
  let deadline = null;
  let closed = null;

  for (const line of lines) {
    const schedMatch = line.match(/SCHEDULED:\s*(<[^>]+>)/);
    if (schedMatch) scheduled = schedMatch[1];
    const deadMatch = line.match(/DEADLINE:\s*(<[^>]+>)/);
    if (deadMatch) deadline = deadMatch[1];
    const closedMatch = line.match(/CLOSED:\s*(\[[^\]]+\])/);
    if (closedMatch) closed = closedMatch[1];
  }

  // Parse LOGBOOK drawer
  const logbook = [];
  let inLogbook = false;
  let currentLogLine = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ':LOGBOOK:') { inLogbook = true; continue; }
    if (inLogbook && trimmed === ':END:') {
      // Flush any pending log line
      if (currentLogLine) { logbook.push(currentLogLine); currentLogLine = null; }
      inLogbook = false;
      continue;
    }
    if (inLogbook) {
      // State change line: - State "TO" from "FROM"    [timestamp] \\
      const stateMatch = trimmed.match(
        /^- State "(\w+)"\s+from "(\w+)"\s+(\[[^\]]+\])(?:\s*\\\\)?$/
      );
      if (stateMatch) {
        // Flush previous
        if (currentLogLine) logbook.push(currentLogLine);
        currentLogLine = {
          to: stateMatch[1],
          from: stateMatch[2],
          timestamp: stateMatch[3],
          note: null,
        };
        continue;
      }
      // Continuation line (note): starts with spaces after a state line
      if (currentLogLine && trimmed) {
        currentLogLine.note = trimmed;
      }
    }
  }
  if (currentLogLine) logbook.push(currentLogLine);

  // Parse properties drawer (skip LOGBOOK lines)
  let created = null;
  let files = null;
  let inProperties = false;
  let inLogbookForProps = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === ':LOGBOOK:') { inLogbookForProps = true; continue; }
    if (inLogbookForProps && trimmed === ':END:') { inLogbookForProps = false; continue; }
    if (inLogbookForProps) continue;
    if (trimmed === ':PROPERTIES:') { inProperties = true; continue; }
    if (trimmed === ':END:') { inProperties = false; continue; }
    if (inProperties) {
      const propMatch = trimmed.match(/^:(\w+):\s*(.+)$/);
      if (propMatch) {
        if (propMatch[1] === 'created') created = propMatch[2].trim();
        if (propMatch[1] === 'files') files = propMatch[2].trim();
      }
    }
  }

  // Parse *** Problem and *** Solution subsections
  let problem = null;
  let solution = null;
  let currentSection = null;
  const sectionContent = { problem: [], solution: [] };

  for (const line of lines) {
    if (line.match(/^\*\*\*\s+Problem\s*$/i)) {
      currentSection = 'problem';
      continue;
    }
    if (line.match(/^\*\*\*\s+Solution\s*$/i)) {
      currentSection = 'solution';
      continue;
    }
    if (line.match(/^\*{1,3}\s/)) {
      // Another headline, stop current section
      if (currentSection) currentSection = null;
      continue;
    }
    if (currentSection) {
      sectionContent[currentSection].push(line);
    }
  }

  problem = sectionContent.problem.join('\n').trim() || null;
  solution = sectionContent.solution.join('\n').trim() || null;

  return { state, priority, title, area, created, files, scheduled, deadline, closed, logbook, problem, solution };
}

/**
 * Parse entire TODOS.org content into { active: [...], archive: [...] }
 */
function parseTodosFile(content) {
  const active = [];
  const archive = [];

  // Split into top-level sections (* Active, * Archive)
  let currentTopSection = null;
  let currentEntry = null;
  const entryLines = [];

  const lines = content.split('\n');

  function flushEntry() {
    if (currentEntry !== null) {
      const text = entryLines.join('\n');
      const parsed = parseTodoEntry(text);
      if (parsed) {
        if (currentTopSection === 'active') active.push(parsed);
        else if (currentTopSection === 'archive') archive.push(parsed);
      }
    }
    entryLines.length = 0;
    currentEntry = null;
  }

  for (const line of lines) {
    // Top-level heading
    if (line.match(/^\*\s+Active\s*$/i)) {
      flushEntry();
      currentTopSection = 'active';
      continue;
    }
    if (line.match(/^\*\s+Archive\s*$/i)) {
      flushEntry();
      currentTopSection = 'archive';
      continue;
    }
    // Other top-level headings end the current section
    if (line.match(/^\*\s+/) && !line.match(/^\*\*\s+/)) {
      flushEntry();
      currentTopSection = null;
      continue;
    }

    // Level-2 headline with TODO keyword = new entry
    if (line.match(/^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)\s+/)) {
      flushEntry();
      currentEntry = true;
      entryLines.push(line);
      continue;
    }

    // Accumulate lines into current entry
    if (currentEntry !== null) {
      entryLines.push(line);
    }
  }

  flushEntry();
  return { active, archive };
}

/**
 * Build the file header for TODOS.org
 */
function buildTodosHeader(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `#+title: Project TODOs
#+author: GMSD
#+date: ${orgDate(d)}
#+startup: indent
#+options: toc:2 num:nil ^:{}
#+TODO: TODO(t) NEXT(n) WAITING(w) | DONE(d) CANCELLED(c)
`;
}

/**
 * Build a single todo entry string
 */
function buildTodoEntry({ title, area, priority, state, created, files, problem, solution, scheduled, deadline, logbook }) {
  state = state || 'TODO';
  const priorityCookie = priority ? ` [#${priority}]` : '';
  const tag = area ? `${' '.repeat(Math.max(1, 56 - title.length - state.length - priorityCookie.length))}:${area}:` : '';
  let entry = `** ${state}${priorityCookie} ${title}${tag}\n`;

  // Planning line
  const planningParts = [];
  if (scheduled) planningParts.push(`SCHEDULED: ${scheduled}`);
  if (deadline) planningParts.push(`DEADLINE: ${deadline}`);
  if (planningParts.length) entry += planningParts.join(' ') + '\n';

  // LOGBOOK drawer (between planning line and PROPERTIES, per org-mode spec)
  if (logbook && logbook.length > 0) {
    entry += ':LOGBOOK:\n';
    for (const log of logbook) {
      const stateChange = `- State "${log.to}" from "${log.from}"`;
      const padding = Math.max(1, 33 - stateChange.length);
      entry += `${stateChange}${' '.repeat(padding)}${log.timestamp}`;
      if (log.note) {
        entry += ' \\\\\n  ' + log.note;
      }
      entry += '\n';
    }
    entry += ':END:\n';
  }

  // Properties drawer
  entry += ':PROPERTIES:\n';
  if (created) entry += `:created: ${created}\n`;
  if (files) entry += `:files: ${files}\n`;
  entry += ':END:\n';

  // Subsections
  if (problem) {
    entry += `\n*** Problem\n${problem}\n`;
  }
  if (solution) {
    entry += `\n*** Solution\n${solution}\n`;
  }

  return entry;
}

// ─── Mutation Layer (pure, string in → string out) ───────────────────────────

/**
 * Insert a LOGBOOK entry into a todo entry's text block.
 * If :LOGBOOK: exists, prepend the new log line (most recent first).
 * If no :LOGBOOK:, create one at the correct position:
 *   after headline + planning line, before :PROPERTIES:.
 *
 * @param {string} entryText - The full text of a ** level todo entry
 * @param {object} opts - { from, to, timestamp, note }
 * @returns {string} The entry text with LOGBOOK entry inserted
 */
function insertLogbookEntry(entryText, { from, to, timestamp, note }) {
  // Build the log line with aligned "from" column
  const toStr = `"${to}"`;
  const fromStr = `"${from}"`;
  // Pad to align timestamps (org convention: ~30 chars for state change prefix)
  const stateChange = `- State ${toStr} from ${fromStr}`;
  const padding = Math.max(1, 33 - stateChange.length);
  let logLine = `${stateChange}${' '.repeat(padding)}${timestamp}`;
  if (note) {
    logLine += ' \\\\\n  ' + note;
  }

  const lines = entryText.split('\n');

  // Check if :LOGBOOK: already exists
  const logbookStart = lines.findIndex(l => l.trim() === ':LOGBOOK:');

  if (logbookStart !== -1) {
    // Insert after :LOGBOOK: line (most recent first)
    lines.splice(logbookStart + 1, 0, logLine);
    return lines.join('\n');
  }

  // No existing LOGBOOK — create one
  // Position: after headline + planning line, before :PROPERTIES:
  const propertiesIdx = lines.findIndex(l => l.trim() === ':PROPERTIES:');
  const insertIdx = propertiesIdx !== -1 ? propertiesIdx : lines.length;

  const logbookBlock = [':LOGBOOK:', logLine, ':END:'];
  lines.splice(insertIdx, 0, ...logbookBlock);
  return lines.join('\n');
}

/**
 * Append a new entry under * Active section.
 * If file content is empty or missing * Active, creates the structure.
 */
function appendEntry(fileContent, entryText) {
  if (!fileContent || !fileContent.includes('* Active')) {
    // Create structure with header
    const header = buildTodosHeader(new Date());
    return header + '\n* Active\n\n' + entryText + '\n* Archive\n';
  }

  // Find the end of Active section (before * Archive or EOF)
  const archiveMatch = fileContent.match(/^(\* Archive)\s*$/m);
  if (archiveMatch) {
    const idx = fileContent.indexOf(archiveMatch[0]);
    const before = fileContent.slice(0, idx);
    const after = fileContent.slice(idx);
    return before + entryText + '\n' + after;
  }

  // No archive section, append to end
  return fileContent + '\n' + entryText + '\n* Archive\n';
}

/**
 * Shared implementation for completing/cancelling an entry.
 * Changes state, adds CLOSED timestamp, inserts LOGBOOK entry, moves to Archive.
 * @private
 */
function _finishEntry(fileContent, entryTitle, closedDate, targetState, { reason } = {}) {
  const closed = orgDateTime(closedDate || new Date());
  const lines = fileContent.split('\n');
  const result = [];
  let entryBuffer = [];
  let foundEntry = false;
  let capturing = false;
  let movedEntry = '';
  let oldState = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of the target entry
    if (!foundEntry && line.match(/^\*\*\s+(TODO|NEXT|WAITING)\s+/) && line.includes(entryTitle)) {
      capturing = true;
      foundEntry = true;
      // Capture old state before changing
      const stateMatch = line.match(/^\*\*\s+(TODO|NEXT|WAITING)/);
      oldState = stateMatch[1];
      // Change state to targetState
      const newLine = line.replace(/^\*\*\s+(TODO|NEXT|WAITING)/, `** ${targetState}`);
      entryBuffer.push(newLine);
      continue;
    }

    if (capturing) {
      // End of entry: next ** or * heading
      if (line.match(/^\*{1,2}\s+/) && !line.match(/^\*\*\*\s+/)) {
        capturing = false;
        let entryText = entryBuffer.join('\n');
        entryText = insertClosedTimestamp(entryText, closed);
        entryText = insertLogbookEntry(entryText, {
          from: oldState,
          to: targetState,
          timestamp: closed,
          note: reason || null,
        });
        movedEntry = entryText;
        result.push(line);
        continue;
      }
      entryBuffer.push(line);
      continue;
    }

    result.push(line);
  }

  // If we were still capturing at EOF
  if (capturing) {
    let entryText = entryBuffer.join('\n');
    entryText = insertClosedTimestamp(entryText, closed);
    entryText = insertLogbookEntry(entryText, {
      from: oldState,
      to: targetState,
      timestamp: closed,
      note: reason || null,
    });
    movedEntry = entryText;
  }

  if (!foundEntry) return fileContent; // No match found

  let content = result.join('\n');

  // Append to Archive
  const archiveMatch = content.match(/^(\* Archive)\s*$/m);
  if (archiveMatch) {
    const idx = content.indexOf(archiveMatch[0]) + archiveMatch[0].length;
    content = content.slice(0, idx) + '\n\n' + movedEntry + content.slice(idx);
  } else {
    content += '\n\n* Archive\n\n' + movedEntry;
  }

  return content;
}

/**
 * Mark an entry as DONE, add CLOSED timestamp, move to Archive.
 */
function completeEntry(fileContent, entryTitle, closedDate, { reason } = {}) {
  return _finishEntry(fileContent, entryTitle, closedDate, 'DONE', { reason });
}

/**
 * Mark an entry as CANCELLED, add CLOSED timestamp, move to Archive.
 */
function cancelEntry(fileContent, entryTitle, closedDate, { reason } = {}) {
  return _finishEntry(fileContent, entryTitle, closedDate, 'CANCELLED', { reason });
}

/**
 * Insert CLOSED timestamp after the headline line
 */
function insertClosedTimestamp(entryText, closedTimestamp) {
  const lines = entryText.split('\n');
  // Insert after headline (line 0), before any planning lines or properties
  const headline = lines[0];
  const rest = lines.slice(1);

  // Check if there's already a planning line (SCHEDULED/DEADLINE)
  let insertIdx = 0;
  if (rest[0] && rest[0].match(/^(SCHEDULED|DEADLINE):/)) {
    // Prepend CLOSED to planning line
    rest[0] = `CLOSED: ${closedTimestamp} ${rest[0]}`;
    return [headline, ...rest].join('\n');
  }

  return [headline, `CLOSED: ${closedTimestamp}`, ...rest].join('\n');
}

/**
 * Change the TODO state of an entry.
 * When opts.timestamp is provided, also inserts a LOGBOOK entry.
 */
function updateEntryState(fileContent, entryTitle, newState, { reason, timestamp } = {}) {
  if (!ALL_STATES.includes(newState)) return fileContent;

  const lines = fileContent.split('\n');
  let matchIdx = -1;
  let oldState = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)\s+/) && lines[i].includes(entryTitle)) {
      const stateMatch = lines[i].match(/^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)/);
      oldState = stateMatch[1];
      lines[i] = lines[i].replace(/^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)/, `** ${newState}`);
      matchIdx = i;
      break;
    }
  }

  if (matchIdx === -1) return fileContent;

  // If no timestamp, just return the state change (backward compatible)
  if (!timestamp) return lines.join('\n');

  // Find the entry boundaries and insert LOGBOOK
  let entryEnd = lines.length;
  for (let i = matchIdx + 1; i < lines.length; i++) {
    if (lines[i].match(/^\*{1,2}\s+/) && !lines[i].match(/^\*\*\*\s+/)) {
      entryEnd = i;
      break;
    }
  }

  const entryLines = lines.slice(matchIdx, entryEnd);
  const entryText = entryLines.join('\n');
  const updatedEntry = insertLogbookEntry(entryText, {
    from: oldState,
    to: newState,
    timestamp,
    note: reason || null,
  });

  const before = lines.slice(0, matchIdx);
  const after = lines.slice(entryEnd);
  return [...before, updatedEntry, ...after].join('\n');
}

/**
 * Change the priority of an entry.
 */
function updateEntryPriority(fileContent, entryTitle, newPriority) {
  if (!PRIORITIES.includes(newPriority)) return fileContent;

  const lines = fileContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\*\*\s+(TODO|NEXT|WAITING|DONE|CANCELLED)\s+/) && lines[i].includes(entryTitle)) {
      // Replace existing priority or insert one
      if (lines[i].match(/\[#[ABC]\]/)) {
        lines[i] = lines[i].replace(/\[#[ABC]\]/, `[#${newPriority}]`);
      } else {
        // Insert priority after state keyword
        lines[i] = lines[i].replace(
          /^(\*\*\s+(?:TODO|NEXT|WAITING|DONE|CANCELLED))\s+/,
          `$1 [#${newPriority}] `
        );
      }
      break;
    }
  }
  return lines.join('\n');
}

// ─── Auto-Migration ──────────────────────────────────────────────────────────

/**
 * Check if old file-per-todo directories exist.
 */
function hasLegacyFormat(cwd) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const doneDir = path.join(cwd, '.planning', 'todos', 'done');
  return fs.existsSync(pendingDir) || fs.existsSync(completedDir) || fs.existsSync(doneDir);
}

/**
 * Migrate old file-per-todo directories to TODOS.org.
 * Returns { active, archived, errors } counts.
 */
function migrateToTodosOrg(cwd) {
  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const doneDir = path.join(cwd, '.planning', 'todos', 'done');

  const migrated = { active: 0, archived: 0, errors: [] };

  const now = new Date();
  let content = buildTodosHeader(now) + '\n* Active\n\n';

  for (const dir of [pendingDir]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(DOC_EXT) || f.endsWith('.md'));
    for (const file of files) {
      try {
        const text = fs.readFileSync(path.join(dir, file), 'utf-8');
        const entry = parseLegacyTodo(text, 'TODO');
        content += entry + '\n';
        migrated.active++;
      } catch (e) {
        migrated.errors.push({ file, error: e.message });
      }
    }
  }

  content += '* Archive\n\n';

  for (const dir of [completedDir, doneDir]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(DOC_EXT) || f.endsWith('.md'));
    for (const file of files) {
      try {
        const text = fs.readFileSync(path.join(dir, file), 'utf-8');
        const entry = parseLegacyTodo(text, 'DONE');
        content += entry + '\n';
        migrated.archived++;
      } catch (e) {
        migrated.errors.push({ file, error: e.message });
      }
    }
  }

  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  fs.writeFileSync(todosPath, content, 'utf-8');

  return migrated;
}

/**
 * If old format directories exist and no TODOS.org, auto-migrate then continue.
 */
function autoMigrateIfLegacy(cwd) {
  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  if (!fs.existsSync(todosPath) && hasLegacyFormat(cwd)) {
    migrateToTodosOrg(cwd);
  }
}

// ─── Command Layer (I/O) ─────────────────────────────────────────────────────

/**
 * Add a new todo entry to TODOS.org
 */
function cmdTodoAdd(cwd, params, raw) {
  if (!params.title) {
    error('--title is required for todo add');
  }

  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  const now = new Date();

  // Ensure .planning exists
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });

  let content = safeReadFile(todosPath) || '';

  const entry = buildTodoEntry({
    title: params.title,
    area: params.area || null,
    priority: params.priority || null,
    state: params.state || 'TODO',
    created: orgDate(now),
    files: params.files || null,
    problem: params.problem || null,
    solution: params.solution || null,
    scheduled: params.scheduled || null,
    deadline: params.deadline || null,
  });

  content = appendEntry(content, entry);
  fs.writeFileSync(todosPath, content, 'utf-8');

  // Auto-register in global index if it exists
  const globalPath = path.join(require('os').homedir(), FILES.TODOS);
  if (fs.existsSync(globalPath)) {
    registerInGlobalIndex(globalPath, cwd);
  }

  output({
    added: true,
    title: params.title,
    area: params.area || null,
    priority: params.priority || null,
    file: path.join('.planning', FILES.TODOS),
  }, raw, `added: ${params.title}`);
}

/**
 * Mark a todo as DONE and move to Archive
 */
function cmdTodoComplete(cwd, identifier, reason, raw) {
  if (!identifier) {
    error('title identifier required for todo complete');
  }

  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  autoMigrateIfLegacy(cwd);
  let content = safeReadFile(todosPath);

  if (!content) {
    error(`TODOS.org not found at ${path.join('.planning', FILES.TODOS)}`);
  }

  const before = parseTodosFile(content);
  const match = before.active.find(t => t.title === identifier || t.title.includes(identifier));
  if (!match) {
    error(`No active todo matching: ${identifier}`);
  }

  const now = new Date();
  content = completeEntry(content, match.title, now, { reason: reason || null });
  fs.writeFileSync(todosPath, content, 'utf-8');

  output({
    completed: true,
    title: match.title,
    date: now.toISOString().split('T')[0],
    reason: reason || null,
    file: path.join('.planning', FILES.TODOS),
  }, raw, 'completed');
}

/**
 * Mark a todo as CANCELLED and move to Archive
 */
function cmdTodoCancel(cwd, identifier, reason, raw) {
  if (!identifier) {
    error('title identifier required for todo cancel');
  }

  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  autoMigrateIfLegacy(cwd);
  let content = safeReadFile(todosPath);

  if (!content) {
    error(`TODOS.org not found at ${path.join('.planning', FILES.TODOS)}`);
  }

  const before = parseTodosFile(content);
  const match = before.active.find(t => t.title === identifier || t.title.includes(identifier));
  if (!match) {
    error(`No active todo matching: ${identifier}`);
  }

  const now = new Date();
  content = cancelEntry(content, match.title, now, { reason: reason || null });
  fs.writeFileSync(todosPath, content, 'utf-8');

  output({
    cancelled: true,
    title: match.title,
    date: now.toISOString().split('T')[0],
    reason: reason || null,
    file: path.join('.planning', FILES.TODOS),
  }, raw, 'cancelled');
}

/**
 * Update state or priority of a todo
 */
function cmdTodoUpdate(cwd, identifier, updates, raw) {
  if (!identifier) {
    error('title identifier required for todo update');
  }

  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  autoMigrateIfLegacy(cwd);
  let content = safeReadFile(todosPath);
  if (!content) {
    error(`TODOS.org not found at ${path.join('.planning', FILES.TODOS)}`);
  }

  const before = parseTodosFile(content);
  const match = before.active.find(t => t.title === identifier || t.title.includes(identifier));
  if (!match) {
    error(`No active todo matching: ${identifier}`);
  }

  // Handle DONE_STATES: delegate to complete/cancel (adds CLOSED, moves to Archive)
  if (updates.state && DONE_STATES.includes(updates.state)) {
    const now = new Date();
    if (updates.state === 'DONE') {
      content = completeEntry(content, match.title, now, { reason: updates.reason || null });
    } else if (updates.state === 'CANCELLED') {
      content = cancelEntry(content, match.title, now, { reason: updates.reason || null });
    }
    // Apply priority change if also requested (on the archived entry)
    if (updates.priority) {
      content = updateEntryPriority(content, match.title, updates.priority);
    }
    fs.writeFileSync(todosPath, content, 'utf-8');
    output({
      updated: true,
      title: match.title,
      state: updates.state,
      priority: updates.priority || match.priority,
      reason: updates.reason || null,
    }, raw, `updated: ${match.title}`);
    return;
  }

  if (updates.state) {
    const now = new Date();
    content = updateEntryState(content, match.title, updates.state, {
      reason: updates.reason || null,
      timestamp: updates.reason ? orgDateTime(now) : null,
    });
  }
  if (updates.priority) {
    content = updateEntryPriority(content, match.title, updates.priority);
  }

  fs.writeFileSync(todosPath, content, 'utf-8');

  output({
    updated: true,
    title: match.title,
    state: updates.state || match.state,
    priority: updates.priority || match.priority,
    reason: updates.reason || null,
  }, raw, `updated: ${match.title}`);
}

/**
 * List todos with optional filters
 */
function cmdTodoList(cwd, filters, raw) {
  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  autoMigrateIfLegacy(cwd);
  let content = safeReadFile(todosPath);

  if (!content) {
    output({ count: 0, todos: [] }, raw, '0');
    return;
  }

  const parsed = parseTodosFile(content);
  let todos = parsed.active;

  // Apply filters
  if (filters.area) {
    todos = todos.filter(t => t.area === filters.area);
  }
  if (filters.state) {
    todos = todos.filter(t => t.state === filters.state);
  }
  if (filters.priority) {
    todos = todos.filter(t => t.priority === filters.priority);
  }

  const result = {
    count: todos.length,
    todos: todos.map(t => ({
      title: t.title,
      state: t.state,
      priority: t.priority,
      area: t.area,
      created: t.created,
      files: t.files,
    })),
  };

  output(result, raw, result.count.toString());
}

/**
 * Init context for todo workflows — replaces cmdInitTodos in init.cjs
 */
function cmdTodoInitContext(cwd, area, raw) {
  const now = new Date();
  const todosPath = path.join(cwd, '.planning', FILES.TODOS);
  autoMigrateIfLegacy(cwd);
  const content = safeReadFile(todosPath);

  if (!content) {
    const result = {
      date: now.toISOString().split('T')[0],
      timestamp: now.toISOString(),
      todo_count: 0,
      todos: [],
      area_filter: area || null,
      todos_file: path.join('.planning', FILES.TODOS),
      todos_file_exists: false,
      planning_exists: fs.existsSync(path.join(cwd, '.planning')),
    };

    output(result, raw);
    return;
  }

  const parsed = parseTodosFile(content);
  let todos = parsed.active;

  if (area) {
    todos = todos.filter(t => t.area === area);
  }

  const result = {
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    todo_count: todos.length,
    todos: todos.map(t => ({
      title: t.title,
      state: t.state,
      priority: t.priority,
      area: t.area,
      created: t.created,
      files: t.files,
      problem: t.problem,
      solution: t.solution,
    })),
    area_filter: area || null,
    todos_file: path.join('.planning', FILES.TODOS),
    todos_file_exists: true,
    planning_exists: true,
    archive_count: parsed.archive.length,
  };

  output(result, raw);
}

/**
 * Migrate old file-per-todo to single TODOS.org
 */
function cmdTodoMigrate(cwd, raw) {
  const todosPath = path.join(cwd, '.planning', FILES.TODOS);

  if (fs.existsSync(todosPath)) {
    error('TODOS.org already exists. Migration would overwrite it.');
  }

  if (!hasLegacyFormat(cwd)) {
    error('No old-format todo directories found to migrate.');
  }

  const migrated = migrateToTodosOrg(cwd);

  output({
    migrated: true,
    active: migrated.active,
    archived: migrated.archived,
    errors: migrated.errors,
    file: path.join('.planning', FILES.TODOS),
    note: 'Old directories NOT deleted. Remove manually when satisfied.',
  }, raw, `migrated ${migrated.active + migrated.archived} todos`);
}

/**
 * Parse a legacy file-per-todo into a new org entry string
 */
function parseLegacyTodo(text, defaultState) {
  const titleMatch = text.match(/^title:\s*(.+)$/m);
  const areaMatch = text.match(/^area:\s*(.+)$/m);
  const createdMatch = text.match(/^created:\s*(.+)$/m);
  const completedMatch = text.match(/^completed:\s*(.+)$/m);
  const filesMatch = text.match(/^files:\s*\n((?:\s+-\s*.+\n?)*)/m);

  // Extract ## Problem and ## Solution sections
  const problemMatch = text.match(/^##\s+Problem\s*\n([\s\S]*?)(?=^##|\Z)/m);
  const solutionMatch = text.match(/^##\s+Solution\s*\n([\s\S]*?)(?=^##|\Z)/m);

  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
  const area = areaMatch ? areaMatch[1].trim() : null;
  const created = createdMatch ? createdMatch[1].trim() : null;

  let files = null;
  if (filesMatch) {
    const fileLines = filesMatch[1].trim().split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    files = fileLines.join(', ');
  }

  const state = completedMatch ? 'DONE' : defaultState;
  const problem = problemMatch ? problemMatch[1].trim() : null;
  const solution = solutionMatch ? solutionMatch[1].trim() : null;

  let createdOrg = null;
  if (created) {
    try { createdOrg = orgDate(new Date(created)); } catch { createdOrg = created; }
  }

  let entry = buildTodoEntry({ title, area, state, created: createdOrg, files, problem, solution });

  // Add CLOSED for completed items
  if (completedMatch) {
    const closedDate = completedMatch[1].trim();
    try {
      const closedOrg = orgDate(new Date(closedDate));
      // Insert CLOSED after headline
      const lines = entry.split('\n');
      entry = [lines[0], `CLOSED: ${closedOrg}`, ...lines.slice(1)].join('\n');
    } catch {}
  }

  return entry;
}

/**
 * Register project in global ~/TODOS.org index
 */
function cmdTodoGlobalRegister(cwd, raw) {
  const os = require('os');
  const globalPath = path.join(os.homedir(), FILES.TODOS);

  registerInGlobalIndex(globalPath, cwd);

  output({
    registered: true,
    global_file: globalPath,
    project: path.basename(cwd),
  }, raw, `registered in ${globalPath}`);
}

/**
 * Update global TODOS.org with a link to this project's TODOS.org
 */
function registerInGlobalIndex(globalPath, cwd) {
  const projectName = path.basename(cwd);
  const projectTodosPath = path.join(cwd, '.planning', FILES.TODOS);
  const link = `[[file:${projectTodosPath}][${projectName}]]`;

  let content = '';
  if (fs.existsSync(globalPath)) {
    content = fs.readFileSync(globalPath, 'utf-8');
    // Check if already registered
    if (content.includes(projectTodosPath)) return;
  } else {
    content = `#+title: Global TODO Index\n#+author: GMSD\n#+startup: indent\n\n* Projects\n\n`;
  }

  content += `- ${link}\n`;
  fs.writeFileSync(globalPath, content, 'utf-8');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Parser layer
  orgDate,
  orgActiveDate,
  orgDateTime,
  parseTodoEntry,
  parseTodosFile,
  buildTodosHeader,
  buildTodoEntry,

  // Mutation layer
  appendEntry,
  completeEntry,
  cancelEntry,
  insertLogbookEntry,
  updateEntryState,
  updateEntryPriority,
  insertClosedTimestamp,

  // Command layer
  cmdTodoAdd,
  cmdTodoComplete,
  cmdTodoCancel,
  cmdTodoUpdate,
  cmdTodoList,
  cmdTodoInitContext,
  cmdTodoMigrate,
  cmdTodoGlobalRegister,

  // Constants
  TODO_STATES,
  DONE_STATES,
  ALL_STATES,
  PRIORITIES,
};
