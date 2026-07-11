# Handling change — absorb a pivot without leaving debt

**Load when:** the goal, scope, architecture, or a chosen approach changes mid-project.

A change isn't done when the new code works — it's done when nothing in the system still assumes the
old design. Treat the durable state (memory, docs, task list, the resume breadcrumb, the operating
files) as part of the change, not an afterthought — that's what stops a pivot from quietly turning
into tech debt.

- **Name the change and its blast radius first.** Spell out what's changing and everything it
  touches — code, data/schema, deps, tests, docs, memory, tasks — before you edit. You can't cleanly
  update what you haven't located.
- **Propose before you cut, for anything big.** Architecture / UX / deployment-level pivots: present
  the plan and get a go-ahead first (`cadence-and-collaboration.md`). Small, reversible changes: just
  make them.
- **Re-research what the change touches.** A new library/API/config in the mix is exactly where
  stale assumptions sneak in — verify before building on it (`research.md`).
- **Update every durable surface, not just the code.** Sync memory (decisions that changed), the
  living docs (architecture/specs), the task list, and `.claude/session.local.md`. If a *standard*
  changed, update `AGENTS.md` / `docs/`. Stale durable state is worse than stale code — the next
  session trusts it.
- **Purge what the change orphans.** Delete the now-dead code, abstractions, flags, tests, and docs
  the pivot leaves behind — don't park them "for later" (`coding-standards.md`: refactor as you go,
  no tech debt). *Less is more* bites hardest right after a change.
- **Re-gate, then commit the pivot as one coherent unit.** Full gate green, then commit code + docs
  + state together so history reads as one deliberate change, not a trail of fixups
  (`testing-and-verification.md`, `version-control.md`).
- **Hunt the stragglers.** Grep the codebase for anything still assuming the old design — names,
  call sites, comments, config — and finish them off. The change is done when that search comes back
  clean.
