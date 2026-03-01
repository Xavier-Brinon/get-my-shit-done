<purpose>
Capture an idea, task, or issue that surfaces during a GMSD session as a structured todo for later work. Enables "thought → capture → continue" flow without losing context.
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

Extract from init JSON: `date`, `timestamp`, `todo_count`, `todos`, `todos_file`, `todos_file_exists`.

Note existing areas from the todos array for consistency in infer_area step.
</step>

<step name="extract_content">
**With arguments:** Use as the title/focus.
- `/gmsd:add-todo Add auth token refresh` → title = "Add auth token refresh"

**Without arguments:** Analyze recent conversation to extract:
- The specific problem, idea, or task discussed
- Relevant file paths mentioned
- Technical details (error messages, line numbers, constraints)

Formulate:
- `title`: 3-10 word descriptive title (action verb preferred)
- `problem`: What's wrong or why this is needed
- `solution`: Approach hints or "TBD" if just an idea
- `files`: Relevant paths with line numbers from conversation
</step>

<step name="infer_area">
Infer area from file paths:

| Path pattern | Area |
|--------------|------|
| `src/api/*`, `api/*` | `api` |
| `src/components/*`, `src/ui/*` | `ui` |
| `src/auth/*`, `auth/*` | `auth` |
| `src/db/*`, `database/*` | `database` |
| `tests/*`, `__tests__/*` | `testing` |
| `docs/*` | `docs` |
| `.planning/*` | `planning` |
| `scripts/*`, `bin/*` | `tooling` |
| No files or unclear | `general` |

Use existing area from step 2 if similar match exists.
</step>

<step name="check_duplicates">
Check init context `todos` array for matching titles (case-insensitive substring match).

If potential duplicate found:
1. Compare scope with existing todo's problem/solution

If overlapping, use AskUserQuestion:
- header: "Duplicate?"
- question: "Similar todo exists: [title]. What would you like to do?"
- options:
  - "Skip" — keep existing todo
  - "Replace" — update existing with new context
  - "Add anyway" — create as separate todo
</step>

<step name="create_todo">
Use values from init context: `timestamp` and `date` are already available.

```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs todo add \
  --title "$title" \
  --area "$area" \
  --priority B \
  --problem "$problem" \
  --solution "$solution" \
  --files "$files"
```

Priority defaults:
- `A` — blocking current work or critical bug
- `B` — important but not blocking (default)
- `C` — nice-to-have or future improvement
</step>

<step name="update_state">
If `.planning/STATE.org` exists:

1. Re-run `init todos` to get updated count
2. Update "### Pending Todos" under "## Accumulated Context"
</step>

<step name="git_commit">
Commit the todo file and any updated state:

```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs commit "docs: capture todo - [title]" --files .planning/TODOS.org .planning/STATE.org
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: capture todo - [title]"
</step>

<step name="confirm">
```
Todo saved to .planning/TODOS.org

  [title]
  Area: [area] | Priority: [#P]
  Files: [count] referenced

---

Would you like to:

1. Continue with current work
2. Add another todo
3. View all todos (/gmsd:check-todos)
```
</step>

</process>

<success_criteria>
- [ ] TODOS.org exists with valid org structure (* Active / * Archive sections)
- [ ] Todo entry added under * Active with correct state, priority, area tag
- [ ] :PROPERTIES: drawer has :created: and :files: (if any)
- [ ] Problem section has enough context for future Claude
- [ ] No duplicates (checked and resolved)
- [ ] Area consistent with existing todos
- [ ] STATE.org updated if exists
- [ ] TODOS.org and state committed to git
</success_criteria>
