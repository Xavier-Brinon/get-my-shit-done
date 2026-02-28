---
name: gmsd:new-milestone
description: Start a new milestone cycle — update PROJECT.org and route to requirements
argument-hint: "[milestone name, e.g., 'v1.1 Notifications']"
allowed-tools:
  - Read
  - Write
  - Bash
  - Task
  - AskUserQuestion
---
<objective>
Start a new milestone: questioning → research (optional) → requirements → roadmap.

Brownfield equivalent of new-project. Project exists, PROJECT.org has history. Gathers "what's next", updates PROJECT.org, then runs requirements → roadmap cycle.

**Creates/Updates:**
- `.planning/PROJECT.org` — updated with new milestone goals
- `.planning/research/` — domain research (optional, NEW features only)
- `.planning/REQUIREMENTS.org` — scoped requirements for this milestone
- `.planning/ROADMAP.org` — phase structure (continues numbering)
- `.planning/STATE.org` — reset for new milestone

**After:** `/gmsd:plan-phase [N]` to start execution.
</objective>

<execution_context>
@~/.claude/get-my-shit-done/workflows/new-milestone.md
@~/.claude/get-my-shit-done/references/questioning.md
@~/.claude/get-my-shit-done/references/ui-brand.md
@~/.claude/get-my-shit-done/templates/project.org
@~/.claude/get-my-shit-done/templates/requirements.org
</execution_context>

<context>
Milestone name: $ARGUMENTS (optional - will prompt if not provided)

Project and milestone context files are resolved inside the workflow (`init new-milestone`) and delegated via `<files_to_read>` blocks where subagents are used.
</context>

<process>
Execute the new-milestone workflow from @~/.claude/get-my-shit-done/workflows/new-milestone.md end-to-end.
Preserve all workflow gates (validation, questioning, research, requirements, roadmap approval, commits).
</process>
