# Existing-codebase onboarding

**Load when:** adopting this operating manual into a repo that already has real code (the
`project-kickoff` skill routes here when it detects existing code).

Greenfield scaffolds from nothing; an existing codebase already encodes decisions, conventions, and
constraints. The job here isn't to impose a fresh design — it's to **understand what's there, fit
the operating manual to it, and adopt the standards forward without churning working code.** Two
rules sit above everything below: **don't clobber** (never overwrite what exists — reconcile) and
**don't big-bang refactor** (adopt by ratchet, not rewrite).

## Sequence (do this before changing feature code)
1. **Set the goal + finish line** (`kickoff.md` `/goal` pattern) — a sharp, verifiable end
   condition; the standards ride along via `AGENTS.md`. The goal is whatever the user wants done
   in this codebase; "adopt the operating manual" wraps around it, it isn't a license to rewrite
   working code.
2. **Comprehend the codebase first.** Before touching anything, map four things and write them down:
   - **Stack & versions** — read the manifests, lockfiles, and config (not training memory); record
     exact versions and confirm against the installed source (`engineering/research.md`).
   - **Architecture** — entry points, the module tree, the boundaries and seams, where state and IO
     live.
   - **Conventions actually in use** — formatter/linter config, test framework and layout, naming,
     error-handling and logging patterns. The codebase's house style is the source of truth here.
   - **How to build / run / test** — the real commands, taken from scripts/CI and **verified by
     running them**, not assumed.

   Delegate this survey to subagents briefed from the goal so it doesn't eat main context
   (`engineering/delegation-and-context.md`); you orchestrate and verify what they report.
3. **Fill the operating files with reality — don't overwrite.** `CLAUDE.md` stays exactly one
   line — `@AGENTS.md` — so there is a single always-on surface. Put the project's reality into
   `AGENTS.md` itself, keeping only what applies to *every* task (identity, layout, the core
   loop, hard rules); everything task-specific goes into `docs/` files added to the Routing
   table. If a `CLAUDE.md` / `AGENTS.md` already existed, it was kept on install —
   **reconcile** it (fold genuinely useful existing notes in) rather than replacing it. Start
   the docs from the survey (`engineering/memory-and-docs.md`): an architecture/overview doc
   that reflects the real system, so future tasks and subagents brief from fact.
4. **Calibrate the standards & gate to the code — adopt forward.** Do not retrofit the whole
   codebase to the standards in one pass.
   - **Get a gate green on the code as it is.** If lint/types/tests already exist, run them and make
     one combined command green at today's baseline; if none exist, add the minimal standard
     toolchain for the stack (`engineering/coding-standards.md`) configured to *pass on current
     code* — then ratchet rules up over time, not all at once
     (`engineering/testing-and-verification.md`). Once green at the baseline, wire it into a git
     pre-commit hook so it can't be skipped (`engineering/coding-standards.md`).
   - **Match the house style.** Within existing files, consistency with the surrounding code beats
     imposing our defaults; apply the full standards to genuinely new modules. Where the codebase
     conflicts with a standard in a way worth changing, **flag it and propose** — don't silently
     rewrite (`engineering/cadence-and-collaboration.md`).
   - **Backlog the debt, don't mass-fix it.** Record existing violations (oversized files, magic
     numbers, missing types, untested seams) as a tracked backlog and fix them opportunistically
     when you next touch that code — never as a big-bang refactor that buries the actual goal.
5. **Seed memory + docs + resume state from what you found** (`engineering/memory-and-docs.md`): the
   goal, the discovered stack/versions, the architecture and conventions, and the gate command as
   durable facts; the living docs from the survey; the gitignored `.claude/session.local.md`
   breadcrumb; a session name (`/rename`); and the SessionStart hook that logs session ids — so the
   work resumes cleanly.

Then drive the requested change from a dependency-ordered task list, research-first, testing as you
go (`engineering/testing-and-verification.md`) and committing verified milestones without breaking
what already passes (`engineering/version-control.md`). For a pivot mid-stream, see
`engineering/handling-change.md`.

## Re-read the rules as you go (don't run on memory)
On a long-running adoption, the standards fade from context as the work fills it — that's context
rot, the enemy in `AGENTS.md`. So treat the docs as the source of truth, not your recollection:
**at the start of each task and each new phase, re-scan the `AGENTS.md` Routing table and re-read
the rows that apply** (when in doubt, re-read). And **every subagent gets the relevant doc paths in
its brief** — it starts with none of this context, so name the files it must read (this doc,
`coding-standards.md`, the architecture doc) rather than assuming it knows the rules. If you notice
yourself drifting from a standard, stop and re-read before continuing — re-reading is cheap, a
debt-laden codebase is not.

## Onboarding checklist
- [ ] Goal + verifiable finish line set
- [ ] Codebase surveyed: stack+versions, architecture, conventions, real build/run/test commands
- [ ] `AGENTS.md` filled with real commands + key paths (every-task material only; the rest in routed `docs/`)
- [ ] `CLAUDE.md` is exactly `@AGENTS.md`
- [ ] Gate assembled/identified and green on the code as-is (baseline, to ratchet up)
- [ ] Gate wired into a pre-commit hook (green at baseline)
- [ ] House style matched; full standards applied to new code; conflicts flagged, not silently fixed
- [ ] Existing standards violations captured as a backlog (no big-bang refactor)
- [ ] Memory seeded (goal, stack, architecture, conventions, gate command)
- [ ] Docs started from the survey (architecture / overview)
- [ ] Resume breadcrumb (`.claude/session.local.md`) created & gitignored
- [ ] Session named (`/rename`) + session-id hook added (`engineering/memory-and-docs.md`)
- [ ] Cadence agreed (checkpoints vs. continuous)
