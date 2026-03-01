---
name: gmsd:add-todo
description: Capture idea or task as todo from current conversation context
argument-hint: [optional description]
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

<objective>
Capture an idea, task, or issue that surfaces during a GMSD session as a structured todo for later work.

Routes to the add-todo workflow which handles:
- Content extraction from arguments or conversation
- Area inference from file paths
- Duplicate detection and resolution
- Todo entry creation in TODOS.org under * Active
- STATE.org updates
- Git commits
</objective>

<execution_context>
@~/.claude/get-my-shit-done/workflows/add-todo.md
</execution_context>

<context>
Arguments: $ARGUMENTS (optional todo description)

State is resolved in-workflow via `init todos` and targeted reads.
</context>

<process>
**Follow the add-todo workflow** from `@~/.claude/get-my-shit-done/workflows/add-todo.md`.

The workflow handles all logic including:
1. Existing area checking
2. Content extraction (arguments or conversation)
3. Area inference
4. Duplicate checking
5. Todo entry creation in TODOS.org
6. STATE.org updates
7. Git commits
</process>
