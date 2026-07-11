# Version control & security hygiene

**Load when:** committing, branching, or handling secrets/credentials.

- **Commit at every verified milestone** — small, green commits for history + flexibility (easy to
  roll back one bad piece). Don't commit broken or un-gated work.
- **Keep diffs small and single-purpose** — one concern per commit; a large mixed diff hides bugs
  and can't be rolled back cleanly.
- **Never commit secrets.** Commit `.env.example`; keep real `.env` gitignored. Never log, echo, or
  store credentials. If a secret is ever exposed, tell the user to rotate it.
- **Don't break what passes** — the full gate guards regressions and runs from the pre-commit hook;
  never bypass it with `--no-verify` (see `testing-and-verification.md`, `coding-standards.md`).
- Write clear messages; branch for non-trivial work; commit/push only when the user asks (or per the
  agreed cadence).
