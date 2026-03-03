<purpose>
Create `.continue-here.org` handoff file to preserve complete work state across sessions. Enables seamless resumption with full context restoration.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="detect">
Find current phase directory from most recently modified files:

```bash
# Find most recent phase directory with work
ls -lt .planning/phases/*/PLAN.org 2>/dev/null | head -1 | grep -oP 'phases/\K[^/]+'
```

If no active phase detected, ask user which phase they're pausing work on.
</step>

<step name="gather">
**Collect complete state for handoff:**

1. **Current position**: Which phase, which plan, which task
2. **Work completed**: What got done this session
3. **Work remaining**: What's left in current plan/phase
4. **Decisions made**: Key decisions and rationale
5. **Blockers/issues**: Anything stuck
6. **Mental context**: The approach, next steps, "vibe"
7. **Files modified**: What's changed but not committed

Ask user for clarifications if needed via conversational questions.
</step>

<step name="write">
**Write handoff to `.planning/phases/XX-name/.continue-here.org`:**

```org
:PROPERTIES:
:phase: XX-name
:task: 3
:total_tasks: 7
:status: in_progress
:last_updated: [timestamp from current-timestamp]
:END:

#+title: Continue Here — XX-name
#+startup: indent

* Current State

[Where exactly are we? Immediate context]

* Completed Work

- Task 1: [name] - Done
- Task 2: [name] - Done
- Task 3: [name] - In progress, [what's done]

* Remaining Work

- Task 3: [what's left]
- Task 4: Not started
- Task 5: Not started

* Decisions Made

- Decided to use [X] because [reason]
- Chose [approach] over [alternative] because [reason]

* Blockers

- [Blocker 1]: [status/workaround]

* Context

[Mental state, what were you thinking, the plan]

* Next Action

Start with: [specific first action when resuming]
```

Be specific enough for a fresh Claude to understand immediately.

Use `current-timestamp` for last_updated field. You can use init todos (which provides timestamps) or call directly:
```bash
timestamp=$(node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs current-timestamp full --raw)
```
</step>

<step name="commit">
```bash
node ~/.claude/get-my-shit-done/bin/gmsd-tools.cjs commit "wip: [phase-name] paused at task [X]/[Y]" --files .planning/phases/*/.continue-here.org
```
</step>

<step name="confirm">
```
✓ Handoff created: .planning/phases/[XX-name]/.continue-here.org

Current state:

- Phase: [XX-name]
- Task: [X] of [Y]
- Status: [in_progress/blocked]
- Committed as WIP

To resume: /gmsd:resume-work

```
</step>

</process>

<success_criteria>
- [ ] .continue-here.org created in correct phase directory
- [ ] All sections filled with specific content
- [ ] Committed as WIP
- [ ] User knows location and how to resume
</success_criteria>
