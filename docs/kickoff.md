# New-project kickoff

**Load when:** starting a brand-new project (the `project-kickoff` skill drives this).

## Sequence (do this before writing feature code)
1. **Set the goal + finish line** (`/goal` pattern below) — a sharp, verifiable end condition
   keeps long work on track. The standards themselves ride along automatically via `AGENTS.md`.
2. **Clarify, then research.** Ask blocking questions first; then research the problem space, stack
   options, and AI-coding pitfalls via web search + context7 (see `engineering/research.md`).
3. **Decide the stack with evidence.** Verify exact versions/APIs against real sources; record the
   chosen versions + rationale + rejected alternatives (`engineering/memory-and-docs.md`).
4. **Plan architecture for change.** Modular packages, clear boundaries, low coupling, an
   abstraction at every "might swap later" seam; design so added features/variants drop in cleanly.
5. **Break it into a task list.** Dependency-ordered, one concern per task — and err smaller than
   your first instinct: split at seams you can verify, so every task ends with a runnable check.
   Many small tasks beat a few overwhelming ones. Drive the whole build from it.
6. **Scaffold + wire quality gates first.** Lint (no-magic-numbers, import boundaries, max-lines),
   strict types, test runner — **green on an empty repo** before feature work — then bolt the gate
   into a git pre-commit hook so commits physically can't skip it
   (`engineering/coding-standards.md`).
7. **Initialize memory + docs + resume state** (`engineering/memory-and-docs.md`): seed memory
   (goal, stack, decisions), start the docs, create the gitignored `.claude/session.local.md`
   breadcrumb, suggest the user name the session (`/rename`), and add the SessionStart hook that
   logs session ids — so progress survives a fresh chat from day one.

Then build from the task list, testing as you go (`engineering/testing-and-verification.md`) and
committing verified milestones (`engineering/version-control.md`).

## `/goal` — set the finish line (built-in Claude Code command, v2.1.139+)

The standards do **not** go in the goal — `AGENTS.md` is already in context every session and
carries them. `/goal` sets a **completion condition**: a background evaluator re-checks it after
every turn and keeps Claude working until it holds. Keep it tight and verifiable — one measurable
end state plus the constraints that must not be violated along the way. Vague mission prose makes
every check mushy and wastes tokens.

```
/goal <ONE-SENTENCE PROJECT GOAL> is done: every task on the task list is complete; the full
quality gate (format + lint + types + tests) exits 0; docs, memory, and the resume breadcrumb
are updated; and all work is committed. Constraints that must hold throughout: no tests skipped,
weakened, or deleted to make the gate pass; no secrets committed.
```

Fill in the one-sentence goal (and its success criteria) before setting it. On an older Claude
Code without `/goal`, state the same goal + finish line as the first message instead.

## Kickoff checklist
- [ ] Goal + verifiable finish line set (`/goal`)
- [ ] Blocking questions asked & answered
- [ ] Stack chosen with verified versions + rationale recorded (`docs/decisions/`)
- [ ] Architecture planned for modularity / low-coupling / extension
- [ ] Dependency-ordered task list created (small tasks, each with a runnable check)
- [ ] Quality gates (lint + strict types + tests) scaffolded and green
- [ ] Gate wired into a pre-commit hook (and mirrored in CI when CI exists)
- [ ] Memory seeded (goal, decisions, standards, stack)
- [ ] Docs folder started (architecture / specs / setup)
- [ ] Resume breadcrumb (`.claude/session.local.md`) created & gitignored
- [ ] Session named (`/rename`) + session-id hook added (`engineering/memory-and-docs.md`)
- [ ] Cadence agreed (checkpoints vs. continuous)
