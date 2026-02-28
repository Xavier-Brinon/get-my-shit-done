---
type: prompt
name: gmsd:complete-milestone
description: Archive completed milestone and prepare for next version
argument-hint: <version>
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Mark milestone {{version}} complete, archive to milestones/, and update ROADMAP.org and REQUIREMENTS.org.

Purpose: Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.
Output: Milestone archived (roadmap + requirements), PROJECT.org evolved, git tagged.
</objective>

<execution_context>
**Load these files NOW (before proceeding):**

- @~/.claude/get-my-shit-done/workflows/complete-milestone.md (main workflow)
- @~/.claude/get-my-shit-done/templates/milestone-archive.org (archive template)
  </execution_context>

<context>
**Project files:**
- `.planning/ROADMAP.org`
- `.planning/REQUIREMENTS.org`
- `.planning/STATE.org`
- `.planning/PROJECT.org`

**User input:**

- Version: {{version}} (e.g., "1.0", "1.1", "2.0")
  </context>

<process>

**Follow complete-milestone.md workflow:**

0. **Check for audit:**

   - Look for `.planning/v{{version}}-MILESTONE-AUDIT.org`
   - If missing or stale: recommend `/gmsd:audit-milestone` first
   - If audit status is `gaps_found`: recommend `/gmsd:plan-milestone-gaps` first
   - If audit status is `passed`: proceed to step 1

   ```markdown
   ## Pre-flight Check

   {If no v{{version}}-MILESTONE-AUDIT.org:}
   ⚠ No milestone audit found. Run `/gmsd:audit-milestone` first to verify
   requirements coverage, cross-phase integration, and E2E flows.

   {If audit has gaps:}
   ⚠ Milestone audit found gaps. Run `/gmsd:plan-milestone-gaps` to create
   phases that close the gaps, or proceed anyway to accept as tech debt.

   {If audit passed:}
   ✓ Milestone audit passed. Proceeding with completion.
   ```

1. **Verify readiness:**

   - Check all phases in milestone have completed plans (SUMMARY.org exists)
   - Present milestone scope and stats
   - Wait for confirmation

2. **Gather stats:**

   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log
   - Present summary, confirm

3. **Extract accomplishments:**

   - Read all phase SUMMARY.org files in milestone range
   - Extract 4-6 key accomplishments
   - Present for approval

4. **Archive milestone:**

   - Create `.planning/milestones/v{{version}}-ROADMAP.org`
   - Extract full phase details from ROADMAP.org
   - Fill milestone-archive.md template
   - Update ROADMAP.org to one-line summary with link

5. **Archive requirements:**

   - Create `.planning/milestones/v{{version}}-REQUIREMENTS.org`
   - Mark all v1 requirements as complete (checkboxes checked)
   - Note requirement outcomes (validated, adjusted, dropped)
   - Delete `.planning/REQUIREMENTS.org` (fresh one created for next milestone)

6. **Update PROJECT.org:**

   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section
   - Archive previous content in `<details>` (if v1.1+)

7. **Commit and tag:**

   - Stage: MILESTONES.org, PROJECT.org, ROADMAP.org, STATE.org, archive files
   - Commit: `chore: archive v{{version}} milestone`
   - Tag: `git tag -a v{{version}} -m "[milestone summary]"`
   - Ask about pushing tag

8. **Offer next steps:**
   - `/gmsd:new-milestone` — start next milestone (questioning → research → requirements → roadmap)

</process>

<success_criteria>

- Milestone archived to `.planning/milestones/v{{version}}-ROADMAP.org`
- Requirements archived to `.planning/milestones/v{{version}}-REQUIREMENTS.org`
- `.planning/REQUIREMENTS.org` deleted (fresh for next milestone)
- ROADMAP.org collapsed to one-line entry
- PROJECT.org updated with current state
- Git tag v{{version}} created
- Commit successful
- User knows next steps (including need for fresh requirements)
  </success_criteria>

<critical_rules>

- **Load workflow first:** Read complete-milestone.md before executing
- **Verify completion:** All phases must have SUMMARY.org files
- **User confirmation:** Wait for approval at verification gates
- **Archive before deleting:** Always create archive files before updating/deleting originals
- **One-line summary:** Collapsed milestone in ROADMAP.org should be single line with link
- **Context efficiency:** Archive keeps ROADMAP.org and REQUIREMENTS.org constant size per milestone
- **Fresh requirements:** Next milestone starts with `/gmsd:new-milestone` which includes requirements definition
  </critical_rules>
