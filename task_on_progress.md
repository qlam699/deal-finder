# Task on Progress

## 1. Task Summary

- Task: Bootstrap project memory files
- Objective: Create long-term `architecture.md` and temporary `task_on_progress.md` so future AI sessions can continue without re-scanning the whole repo
- Requested behavior: Create the two project-memory files for this project
- Expected result: Both files exist at repo root, filled from verified sources (README, code, deploy docs)
- Started: 2026-09-22
- Status: Completed (memory bootstrap)
- Priority: High (enables all future sessions)

## 2. Scope

### In Scope

- Create `architecture.md` from the required template using confirmed project knowledge
- Create `task_on_progress.md` documenting this bootstrap and handoff state
- Record git/branch context for continuity

### Out of Scope

- Application feature changes
- Refactors, dependency upgrades, or deploy changes
- Committing these files (wait for explicit user request)

## 3. Requirements

### Confirmed Requirements

- Maintain `architecture.md` as long-term project memory
  - Source: `.cursor/rules/project-memory.mdc`
  - Acceptance criteria: Template sections filled with verified facts and evidence

- Maintain `task_on_progress.md` as current-task working memory
  - Source: `.cursor/rules/project-memory.mdc`
  - Acceptance criteria: Enough detail for another session to continue immediately

### Assumptions Requiring Verification

- [ ] README API section is fully current vs newer routes (`check-price`, `check-existence`, scrape settings persistence)
  - Reason: Architecture notes possible lag
  - How to verify: Diff README §7 against `src/app/api/**/route.ts` when an API task starts

## 4. Investigation Completed

### Files Inspected

- `README.md`
  - Relevant symbols or lines: overview, stack, schema, APIs, risks
  - Findings: Primary product/developer spec; Vietnamese twin in `readme-vi.md`
  - Why it matters: Seeded most of `architecture.md`

- `package.json`
  - Findings: Next 16.3.1, React 19, better-sqlite3, AI SDKs, cheerio, node-cron
  - Why it matters: Confirmed runtime stack

- `src/lib/db.ts`
  - Relevant symbols: `getDb`, `ScrapeSettings`, schema, `publishOrDiscardAfterPriceCheck`
  - Findings: `published` / `company_ad` / `content` columns; scrape settings in `settings`; margin publish gate
  - Why it matters: Schema and deal-publish flow beyond older README snippets

- `src/lib/background-job.ts`
  - Relevant symbols: `runScrapeJob`, `startCron`, `getJobStatus`
  - Findings: In-process job + cron; publish/discard after price check
  - Why it matters: Main orchestration path

- `deploy/README.md`, `.github/workflows/deploy.yml`
  - Findings: CI builds tarball; VPS extract; `DATA_DIR=/var/lib/deal`; domain `deal.codayroi.com`
  - Why it matters: Production topology

- `src/app/api/**/route.ts` (file list)
  - Findings: Extra product routes `check-price`, `check-existence` not fully detailed in older README API tables
  - Why it matters: Documented as open verification item

### Commands Executed

```bash
ls -la architecture.md task_on_progress.md 2>/dev/null
git status --short
git branch --show-current
git diff --stat
find src -type f \( -name '*.ts' -o -name '*.tsx' \) | sort
```

Result summary:

- Neither memory file existed before this task
- Branch: `main`
- Untracked before work: `.cursor/` (rules); after work: also the two memory files
- Working tree otherwise clean of source edits

### Existing Behavior

Confirmed MVP: scrape Chợ Tốt → AI price → publish only if margin ≥ threshold → dashboard list of published deals; soft/hard delete with durable `seen_products`; VPS deploy via Actions artifact.

## 5. Implementation Progress

### Changes Completed

- [x] Create `architecture.md`
  - Files: `architecture.md`
  - Summary: Full template populated from README + code + deploy evidence
  - Reason: Long-term project memory required by workspace rules

- [x] Create `task_on_progress.md`
  - Files: `task_on_progress.md`
  - Summary: Documents bootstrap task and handoff
  - Reason: Session continuity for next work

### Changes in Progress

- None

### Changes Not Started

- None for this bootstrap task
- Next product work should replace/reset this file’s task summary when a new feature/bug starts

## 6. Modified Files

### `architecture.md`

- Change: Created
- Reason: Project long-term memory
- Impact: Future sessions should read this before exploring the repo
- Verification: Sections cross-checked against `README.md`, `db.ts`, `background-job.ts`, deploy docs

### `task_on_progress.md`

- Change: Created
- Reason: Current-task handoff for this bootstrap
- Impact: Temporary; replace content when a new development task begins
- Verification: Matches actual git/investigation state at last update

## 7. Current Problem or Blocker

- Problem: None
- Error: —
- Cause: —
- Evidence: —
- Attempts made: —
- Result: —
- Recommended next step: Start the next product task and rewrite sections 1–5 of this file for that task

## 8. Decisions Made

### Bootstrap both memory files now

- Context: User asked to create `architecture.md` and `task_on_progress.md`
- Decision: Create both immediately from verified sources; do not invent unfinished feature work
- Reason: Rules require both; no active feature task was specified
- Alternatives considered: Architecture only; empty task stub
- Impact: Ready for next session; task file should be rewritten when real coding begins

### Prefer code over README where they diverge

- Context: Publish/discard + scrape settings exist in code more strongly than older README flow
- Decision: Document publish gate and settings from `db.ts` / `background-job.ts`
- Reason: Architecture must reflect running behavior
- Alternatives considered: Copy README verbatim
- Impact: Open question remains to sync README API docs later

## 9. Tests and Validation

### Completed

- [x] File existence / structural write
  - Command: write tools + path listing
  - Result: Both files present at repo root

### Remaining

- [ ] Optional: commit memory files when user requests
  - Command: `git add architecture.md task_on_progress.md && git commit ...`
  - Expected result: Tracked in git for team/AI continuity

## 10. Risks and Regression Areas

- Risk: Stale architecture after future code changes
  - Related area: All of `src/lib/*`, API routes, deploy scripts
  - How to test: Diff architecture claims against code when starting related tasks
  - Mitigation: Update `architecture.md` only with verified changes; keep assumptions labeled

- Risk: Leaving bootstrap task notes after a new task starts
  - Related area: `task_on_progress.md`
  - How to test: Check section 1 Task Summary matches the active user request
  - Mitigation: Rewrite this file at the start of the next development task

## 11. Next Steps

Execute these steps in order:

1. Ask the user what product/bug/feature task to start next (or wait for their request).
2. When a new task begins, rewrite `task_on_progress.md` sections 1–5 for that task before editing application code.
3. If the user wants these memory files committed, stage only `architecture.md` / `task_on_progress.md` (and `.cursor/` only if they explicitly want rules tracked).
4. On the next API-related task, verify README §7 against `src/app/api/**/route.ts` and update `architecture.md` section 8 if needed.

## 12. Handoff Notes

- Start by reading: `architecture.md`, then this file, then `git status --short`
- Do not repeat: Full README re-read or full `src/` tree scan unless the next task needs it
- Important context: Deals shown in UI are `published = 1`; failed-margin items are discarded from `products` but kept in `seen_products`
- Be careful about: Plaintext API keys; in-memory cron; do not wipe `/var/lib/deal` on deploy
- Recommended first command:

```bash
git status --short
git branch --show-current
sed -n '1,80p' architecture.md
sed -n '1,60p' task_on_progress.md
```

## 13. Last Update

- Updated: 2026-09-22
- Updated by: Auto (Cursor agent)
- Current branch: `main`
- Git status summary: Untracked `.cursor/`, `architecture.md`, `task_on_progress.md`; no other dirty source files observed at bootstrap time
