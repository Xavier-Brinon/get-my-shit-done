<purpose>
List all active todos, allow selection, load full context for the selected todo, and route to appropriate action.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
Load todo context:

```bash
INIT=$(node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs init todos)
```

Extract from init JSON: `todo_count`, `todos`, `todos_file`.

If `legacy_format` is true, suggest migration:
```
Old file-per-todo format detected. Run `gmsd-tools.cjs todo migrate` to convert to TODOS.org.
```

If `todo_count` is 0:
```
No active todos.

Todos are captured during work sessions with /gmsd:add-todo.
```

If `.planning/STATE.org` exists (active project):
```
Would you like to:

1. Continue with current phase (/gmsd:progress)
2. Add a todo now (/gmsd:add-todo)
```

If `.planning/STATE.org` does NOT exist (no project yet):
```
Would you like to:

1. Add a todo now (/gmsd:add-todo)
2. Start a project (/gmsd:new-project)
```

Exit.
</step>

<step name="parse_filter">
Check for filters in arguments:
- `/gmsd:check-todos` → show all
- `/gmsd:check-todos api` → filter to area:api only
- `/gmsd:check-todos --state NEXT` → filter to NEXT state
- `/gmsd:check-todos --priority A` → filter to priority A
</step>

<step name="list_todos">
Use the `todos` array from init context (already filtered by area if specified).

Parse and display as numbered list:

```
Active Todos:

1. [#A] Add auth token refresh (api, TODO, 2d ago)
2. [#B] Fix modal z-index issue (ui, NEXT, 1d ago)
3. [#C] Refactor database pool (database, WAITING, 5h ago)

---

Reply with a number to view details, or:
- `/gmsd:check-todos [area]` to filter by area
- `/gmsd:check-todos --state NEXT` to filter by state
- `q` to exit
```

Format age as relative time from created timestamp.
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected todo, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
The todo's full context is already available from init data (problem, solution, files).

Display:

```
## [title]

**State:** [state] | **Priority:** [#P] | **Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem
[problem section content]

### Solution
[solution section content]
```

If `files` field has entries, read and briefly summarize each referenced file.
</step>

<step name="check_roadmap">
Check for roadmap (can use init progress or directly check file existence):

If `.planning/ROADMAP.org` exists:
1. Check if todo's area matches an upcoming phase
2. Check if todo's files overlap with a phase's scope
3. Note any match for action options
</step>

<step name="offer_actions">
**If todo maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This todo relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — mark DONE, start working
  - "Cancel it" — mark CANCELLED with reason, move to Archive
  - "Add to phase plan" — include when planning Phase [N]
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — mark DONE, start working
  - "Cancel it" — mark CANCELLED with reason, move to Archive
  - "Create a phase" — /gmsd:add-phase with this scope
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**
```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs todo complete "[title]" --reason "Completed during check-todos workflow"
```
Update STATE.org todo count. Present problem/solution context. Begin work or ask how to proceed.

**Cancel it:**
Ask user for cancellation reason, then:
```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs todo cancel "[title]" --reason "[user's reason]"
```
Update STATE.org todo count. Confirm cancellation.

**Add to phase plan:**
Note todo reference in phase planning notes. Keep as active. Return to list or exit.

**Create a phase:**
Display: `/gmsd:add-phase [description from todo]`
Keep as active. User runs command in fresh context.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_state">
After any action that changes todo count:

Re-run `init todos` to get updated count, then update STATE.org "### Pending Todos" section if exists.
</step>

<step name="git_commit">
If todo was completed, commit the change:

If `.planning/STATE.org` exists:
```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs commit "docs: complete todo - [title]" --files .planning/TODOS.org .planning/STATE.org
```

If `.planning/STATE.org` does NOT exist:
```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs commit "docs: complete todo - [title]" --files .planning/TODOS.org
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: complete todo - [title]"
</step>

</process>

<success_criteria>
- [ ] All active todos listed with title, state, priority, area, age
- [ ] Filters applied if specified (area, state, priority)
- [ ] Selected todo's full context loaded from init data
- [ ] Roadmap context checked for phase match
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] STATE.org updated if todo count changed
- [ ] Changes committed to git (if todo completed)
</success_criteria>
