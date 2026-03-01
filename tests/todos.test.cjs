/**
 * GMSD Tools Tests — Todos (parser + mutation + command layers)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runGsdTools, createTempProject, cleanup } = require('./helpers.cjs');

// Direct module import for pure function tests
const {
  orgDate,
  orgActiveDate,
  parseTodoEntry,
  parseTodosFile,
  buildTodosHeader,
  buildTodoEntry,
  appendEntry,
  completeEntry,
  updateEntryState,
  updateEntryPriority,
  insertClosedTimestamp,
} = require('../get-my-shit-done/bin/lib/todos.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Parser Layer — Pure functions
// ─────────────────────────────────────────────────────────────────────────────

describe('orgDate', () => {
  test('formats date as org inactive timestamp', () => {
    const d = new Date('2026-03-01T12:00:00Z');
    const result = orgDate(d);
    assert.match(result, /^\[2026-03-01 \w{3}\]$/);
  });

  test('accepts string input', () => {
    const result = orgDate('2026-01-15');
    assert.match(result, /^\[2026-01-15 \w{3}\]$/);
  });
});

describe('orgActiveDate', () => {
  test('formats date as org active timestamp', () => {
    const d = new Date('2026-03-05T12:00:00Z');
    const result = orgActiveDate(d);
    assert.match(result, /^<2026-03-05 \w{3}>$/);
  });
});

describe('parseTodoEntry', () => {
  test('parses complete entry with all fields', () => {
    const text = `** TODO [#B] Add auth token refresh                         :api:
SCHEDULED: <2026-03-05 Wed>
:PROPERTIES:
:created: [2026-02-28 Fri]
:files: src/auth/token.ts:45
:END:

*** Problem
Token refresh logic is missing.

*** Solution
Implement refresh token rotation.`;

    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'TODO');
    assert.strictEqual(result.priority, 'B');
    assert.strictEqual(result.title, 'Add auth token refresh');
    assert.strictEqual(result.area, 'api');
    assert.strictEqual(result.scheduled, '<2026-03-05 Wed>');
    assert.strictEqual(result.created, '[2026-02-28 Fri]');
    assert.strictEqual(result.files, 'src/auth/token.ts:45');
    assert.strictEqual(result.problem, 'Token refresh logic is missing.');
    assert.strictEqual(result.solution, 'Implement refresh token rotation.');
  });

  test('parses minimal entry', () => {
    const text = `** TODO Simple task`;
    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'TODO');
    assert.strictEqual(result.priority, null);
    assert.strictEqual(result.title, 'Simple task');
    assert.strictEqual(result.area, null);
  });

  test('parses DONE entry with CLOSED', () => {
    const text = `** DONE [#A] Completed task                                 :database:
CLOSED: [2026-02-26 Wed]
:PROPERTIES:
:created: [2026-02-25 Tue]
:END:`;

    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'DONE');
    assert.strictEqual(result.priority, 'A');
    assert.strictEqual(result.closed, '[2026-02-26 Wed]');
    assert.strictEqual(result.area, 'database');
  });

  test('parses NEXT state', () => {
    const text = `** NEXT [#A] Urgent task                                    :api:`;
    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'NEXT');
    assert.strictEqual(result.priority, 'A');
  });

  test('parses WAITING state', () => {
    const text = `** WAITING Blocked task                                     :ui:`;
    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'WAITING');
    assert.strictEqual(result.area, 'ui');
  });

  test('parses CANCELLED state', () => {
    const text = `** CANCELLED Old task`;
    const result = parseTodoEntry(text);
    assert.strictEqual(result.state, 'CANCELLED');
  });

  test('returns null for invalid headline', () => {
    const result = parseTodoEntry('Not a valid headline');
    assert.strictEqual(result, null);
  });
});

describe('parseTodosFile', () => {
  test('parses file with active and archived todos', () => {
    const content = `#+title: Project TODOs
#+TODO: TODO(t) NEXT(n) WAITING(w) | DONE(d) CANCELLED(c)

* Active

** TODO [#B] Task one                                       :api:
:PROPERTIES:
:created: [2026-02-28 Fri]
:END:

** NEXT [#A] Task two                                       :ui:
:PROPERTIES:
:created: [2026-02-27 Thu]
:END:

* Archive

** DONE Old task                                             :database:
CLOSED: [2026-02-20 Fri]
:PROPERTIES:
:created: [2026-02-18 Wed]
:END:
`;

    const result = parseTodosFile(content);
    assert.strictEqual(result.active.length, 2);
    assert.strictEqual(result.archive.length, 1);
    assert.strictEqual(result.active[0].title, 'Task one');
    assert.strictEqual(result.active[1].title, 'Task two');
    assert.strictEqual(result.archive[0].title, 'Old task');
    assert.strictEqual(result.archive[0].state, 'DONE');
  });

  test('handles empty file', () => {
    const result = parseTodosFile('');
    assert.strictEqual(result.active.length, 0);
    assert.strictEqual(result.archive.length, 0);
  });

  test('handles file with only Active section', () => {
    const content = `* Active

** TODO [#C] Only task
:PROPERTIES:
:created: [2026-03-01 Sun]
:END:
`;
    const result = parseTodosFile(content);
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.archive.length, 0);
  });
});

describe('buildTodosHeader', () => {
  test('produces valid org header', () => {
    const header = buildTodosHeader(new Date('2026-03-01'));
    assert.ok(header.includes('#+title: Project TODOs'));
    assert.ok(header.includes('#+author: GMSD'));
    assert.ok(header.includes('#+TODO: TODO(t) NEXT(n) WAITING(w) | DONE(d) CANCELLED(c)'));
  });
});

describe('buildTodoEntry', () => {
  test('builds complete entry', () => {
    const entry = buildTodoEntry({
      title: 'Fix login bug',
      area: 'auth',
      priority: 'A',
      state: 'TODO',
      created: '[2026-03-01 Sun]',
      files: 'src/auth/login.ts:42',
      problem: 'Users get 403 errors.',
      solution: 'Check token expiry.',
    });

    assert.ok(entry.includes('** TODO [#A] Fix login bug'));
    assert.ok(entry.includes(':auth:'));
    assert.ok(entry.includes(':created: [2026-03-01 Sun]'));
    assert.ok(entry.includes(':files: src/auth/login.ts:42'));
    assert.ok(entry.includes('*** Problem'));
    assert.ok(entry.includes('Users get 403 errors.'));
    assert.ok(entry.includes('*** Solution'));
    assert.ok(entry.includes('Check token expiry.'));
  });

  test('builds minimal entry', () => {
    const entry = buildTodoEntry({ title: 'Simple task' });
    assert.ok(entry.includes('** TODO Simple task'));
    assert.ok(entry.includes(':PROPERTIES:'));
    assert.ok(entry.includes(':END:'));
  });

  test('defaults state to TODO', () => {
    const entry = buildTodoEntry({ title: 'Test' });
    assert.ok(entry.startsWith('** TODO'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutation Layer — Pure string transformations
// ─────────────────────────────────────────────────────────────────────────────

describe('appendEntry', () => {
  test('creates structure when file is empty', () => {
    const result = appendEntry('', '** TODO Test task\n:PROPERTIES:\n:END:\n');
    assert.ok(result.includes('* Active'));
    assert.ok(result.includes('** TODO Test task'));
    assert.ok(result.includes('* Archive'));
  });

  test('inserts before Archive section', () => {
    const existing = `#+title: TODOs

* Active

** TODO Existing task
:PROPERTIES:
:END:

* Archive
`;
    const result = appendEntry(existing, '** TODO New task\n:PROPERTIES:\n:END:\n');
    assert.ok(result.includes('** TODO Existing task'));
    assert.ok(result.includes('** TODO New task'));
    // New task should be before Archive
    const newIdx = result.indexOf('** TODO New task');
    const archiveIdx = result.indexOf('* Archive');
    assert.ok(newIdx < archiveIdx, 'new entry should be before Archive');
  });
});

describe('completeEntry', () => {
  test('changes state to DONE and moves to Archive', () => {
    const content = `* Active

** TODO [#B] Fix bug                                        :api:
:PROPERTIES:
:created: [2026-03-01 Sun]
:END:

*** Problem
It crashes.

* Archive
`;
    const result = completeEntry(content, 'Fix bug', new Date('2026-03-02'));
    // Should no longer be in Active with TODO state
    const activeSection = result.slice(0, result.indexOf('* Archive'));
    assert.ok(!activeSection.includes('** TODO'), 'no TODO entries in Active');
    // Should be in Archive with DONE state
    const archiveSection = result.slice(result.indexOf('* Archive'));
    assert.ok(archiveSection.includes('** DONE'), 'DONE entry in Archive');
    assert.ok(archiveSection.includes('CLOSED:'), 'has CLOSED timestamp');
  });

  test('returns unchanged content when title not found', () => {
    const content = `* Active

** TODO Some task
:PROPERTIES:
:END:

* Archive
`;
    const result = completeEntry(content, 'Nonexistent task', new Date());
    assert.strictEqual(result, content);
  });
});

describe('updateEntryState', () => {
  test('changes TODO to NEXT', () => {
    const content = `** TODO [#B] My task                                        :api:\n:PROPERTIES:\n:END:\n`;
    const result = updateEntryState(content, 'My task', 'NEXT');
    assert.ok(result.includes('** NEXT [#B] My task'));
  });

  test('changes NEXT to WAITING', () => {
    const content = `** NEXT My task\n`;
    const result = updateEntryState(content, 'My task', 'WAITING');
    assert.ok(result.includes('** WAITING My task'));
  });

  test('ignores invalid state', () => {
    const content = `** TODO My task\n`;
    const result = updateEntryState(content, 'My task', 'INVALID');
    assert.strictEqual(result, content);
  });
});

describe('updateEntryPriority', () => {
  test('changes existing priority', () => {
    const content = `** TODO [#B] My task                                        :api:\n`;
    const result = updateEntryPriority(content, 'My task', 'A');
    assert.ok(result.includes('[#A]'));
    assert.ok(!result.includes('[#B]'));
  });

  test('adds priority when none exists', () => {
    const content = `** TODO My task\n`;
    const result = updateEntryPriority(content, 'My task', 'C');
    assert.ok(result.includes('** TODO [#C] My task'));
  });

  test('ignores invalid priority', () => {
    const content = `** TODO [#B] My task\n`;
    const result = updateEntryPriority(content, 'My task', 'X');
    assert.strictEqual(result, content);
  });
});

describe('insertClosedTimestamp', () => {
  test('inserts after headline', () => {
    const entry = `** DONE My task\n:PROPERTIES:\n:END:`;
    const result = insertClosedTimestamp(entry, '[2026-03-01 Sun]');
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '** DONE My task');
    assert.strictEqual(lines[1], 'CLOSED: [2026-03-01 Sun]');
  });

  test('prepends to existing planning line', () => {
    const entry = `** DONE My task\nSCHEDULED: <2026-03-05 Wed>\n:PROPERTIES:\n:END:`;
    const result = insertClosedTimestamp(entry, '[2026-03-01 Sun]');
    assert.ok(result.includes('CLOSED: [2026-03-01 Sun] SCHEDULED:'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Command Layer — CLI integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe('todo add command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('creates TODOS.org with new entry', () => {
    const result = runGsdTools('todo add --title "Add dark mode" --area ui --priority B', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.added, true);
    assert.strictEqual(output.title, 'Add dark mode');
    assert.strictEqual(output.area, 'ui');
    assert.strictEqual(output.priority, 'B');

    // Verify file created
    const todosPath = path.join(tmpDir, '.planning', 'TODOS.org');
    assert.ok(fs.existsSync(todosPath), 'TODOS.org should exist');

    const content = fs.readFileSync(todosPath, 'utf-8');
    assert.ok(content.includes('** TODO [#B] Add dark mode'));
    assert.ok(content.includes(':ui:'));
    assert.ok(content.includes('* Active'));
    assert.ok(content.includes('* Archive'));
  });

  test('appends to existing TODOS.org', () => {
    // Create first todo
    runGsdTools('todo add --title "First task" --area api', tmpDir);
    // Add second
    const result = runGsdTools('todo add --title "Second task" --area ui --priority A', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    assert.ok(content.includes('** TODO First task'));
    assert.ok(content.includes('** TODO [#A] Second task'));
  });

  test('fails without --title', () => {
    const result = runGsdTools('todo add --area api', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('title'), 'error mentions title');
  });

  test('includes problem and solution', () => {
    const result = runGsdTools('todo add --title "Fix crash" --problem "App crashes on login" --solution "Check null pointer"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    assert.ok(content.includes('*** Problem'));
    assert.ok(content.includes('App crashes on login'));
    assert.ok(content.includes('*** Solution'));
    assert.ok(content.includes('Check null pointer'));
  });
});

describe('todo complete command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('marks todo as DONE and moves to Archive', () => {
    // Create a todo first
    runGsdTools('todo add --title "Add dark mode" --area ui --priority B', tmpDir);

    const result = runGsdTools('todo complete "Add dark mode"', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.completed, true);
    assert.strictEqual(output.title, 'Add dark mode');

    // Verify content
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    const archiveSection = content.slice(content.indexOf('* Archive'));
    assert.ok(archiveSection.includes('** DONE'), 'should be DONE in Archive');
    assert.ok(archiveSection.includes('CLOSED:'), 'should have CLOSED timestamp');
  });

  test('fails for nonexistent todo', () => {
    // Create TODOS.org with a different task
    runGsdTools('todo add --title "Some task" --area api', tmpDir);

    const result = runGsdTools('todo complete "nonexistent"', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('No active todo'), 'error mentions not found');
  });

  test('fails when TODOS.org missing', () => {
    const result = runGsdTools('todo complete "anything"', tmpDir);
    assert.ok(!result.success, 'should fail');
  });

  test('suggests migration when old format exists', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'test.org'), 'title: Test\n');

    const result = runGsdTools('todo complete "Test"', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('migrate'), 'error suggests migration');
  });
});

describe('todo update command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('updates state', () => {
    runGsdTools('todo add --title "My task" --area api', tmpDir);
    const result = runGsdTools('todo update My task --state NEXT', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.updated, true);
    assert.strictEqual(output.state, 'NEXT');

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    assert.ok(content.includes('** NEXT'));
  });

  test('updates priority', () => {
    runGsdTools('todo add --title "My task" --priority C', tmpDir);
    const result = runGsdTools('todo update My task --priority A', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    assert.ok(content.includes('[#A]'));
    assert.ok(!content.includes('[#C]'));
  });
});

describe('todo list command (via list-todos)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('lists todos from TODOS.org', () => {
    runGsdTools('todo add --title "Task one" --area api --priority A', tmpDir);
    runGsdTools('todo add --title "Task two" --area ui --priority B', tmpDir);

    const result = runGsdTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 2);
    assert.strictEqual(output.todos[0].title, 'Task one');
    assert.strictEqual(output.todos[1].title, 'Task two');
  });

  test('filters by area', () => {
    runGsdTools('todo add --title "API task" --area api', tmpDir);
    runGsdTools('todo add --title "UI task" --area ui', tmpDir);

    const result = runGsdTools('list-todos api', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 1);
    assert.strictEqual(output.todos[0].area, 'api');
  });

  test('returns empty for no todos', () => {
    const result = runGsdTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 0);
  });

  test('backward compat: lists from old format with warning', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(
      path.join(pendingDir, 'test-task.org'),
      'title: Test task\narea: api\ncreated: 2026-01-01\n'
    );

    const result = runGsdTools('list-todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.count, 1);
    assert.ok(output._migration_warning, 'should include migration warning');
  });
});

describe('init todos command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('returns empty state when no TODOS.org', () => {
    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 0);
    assert.strictEqual(output.todos_file_exists, false);
  });

  test('returns populated state', () => {
    runGsdTools('todo add --title "My task" --area api --priority B', tmpDir);

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    assert.strictEqual(output.todos_file_exists, true);
    assert.strictEqual(output.todos[0].title, 'My task');
    assert.strictEqual(output.todos[0].state, 'TODO');
    assert.strictEqual(output.todos[0].priority, 'B');
    assert.strictEqual(output.todos[0].area, 'api');
  });

  test('filters by area', () => {
    runGsdTools('todo add --title "API task" --area api', tmpDir);
    runGsdTools('todo add --title "UI task" --area ui', tmpDir);

    const result = runGsdTools('init todos api', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.todo_count, 1);
    assert.strictEqual(output.area_filter, 'api');
  });

  test('detects legacy format', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });

    const result = runGsdTools('init todos', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.legacy_format, true);
    assert.ok(output._migration_warning, 'should include migration warning');
  });
});

describe('todo migrate command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('migrates old format todos to TODOS.org', () => {
    // Create old-format todos
    const pendingDir = path.join(tmpDir, '.planning', 'todos', 'pending');
    const completedDir = path.join(tmpDir, '.planning', 'todos', 'completed');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.mkdirSync(completedDir, { recursive: true });

    fs.writeFileSync(
      path.join(pendingDir, 'fix-login.org'),
      'title: Fix login bug\narea: auth\ncreated: 2026-02-28\n\n## Problem\n\nUsers get 403.\n\n## Solution\n\nCheck tokens.\n'
    );

    fs.writeFileSync(
      path.join(completedDir, 'setup-db.org'),
      'completed: 2026-02-20\ntitle: Setup database\narea: database\ncreated: 2026-02-18\n\n## Problem\n\nNo database.\n\n## Solution\n\nAdd PostgreSQL.\n'
    );

    const result = runGsdTools('todo migrate', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.migrated, true);
    assert.strictEqual(output.active, 1);
    assert.strictEqual(output.archived, 1);

    // Verify TODOS.org content
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'utf-8');
    assert.ok(content.includes('Fix login bug'), 'should contain pending todo');
    assert.ok(content.includes('Setup database'), 'should contain completed todo');
    assert.ok(content.includes('* Active'), 'should have Active section');
    assert.ok(content.includes('* Archive'), 'should have Archive section');

    // Verify old directories still exist
    assert.ok(fs.existsSync(pendingDir), 'old pending dir should NOT be deleted');
  });

  test('fails when TODOS.org already exists', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'TODOS.org'), 'existing', 'utf-8');
    const result = runGsdTools('todo migrate', tmpDir);
    assert.ok(!result.success, 'should fail');
    assert.ok(result.error.includes('already exists'), 'error mentions existing file');
  });

  test('handles done/ directory (naming inconsistency)', () => {
    const doneDir = path.join(tmpDir, '.planning', 'todos', 'done');
    fs.mkdirSync(doneDir, { recursive: true });

    fs.writeFileSync(
      path.join(doneDir, 'old-task.org'),
      'completed: 2026-01-15\ntitle: Old task\narea: general\ncreated: 2026-01-10\n'
    );

    const result = runGsdTools('todo migrate', tmpDir);
    assert.ok(result.success, `Command failed: ${result.error}`);

    const output = JSON.parse(result.output);
    assert.strictEqual(output.archived, 1);
  });
});
