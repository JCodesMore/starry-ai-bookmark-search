# Testing & verification — collect evidence it works

**Load when:** testing, verifying, or about to call something "done."

- **Test as you go and at the end** — a feature isn't done until verified. Don't batch testing.
- **Split automated vs. manual deliberately:** automate everything you can (unit, integration,
  the critical/invariant logic); tell the user clearly what *they* must test manually (real OAuth,
  the real deployed environment) and walk them through it.
- **Make it locally testable without external deps** (mocks/dev seams for third-party services)
  so iteration is fast and not blocked on external setup.
- **Full gate green before every commit:** auto-format + all linters + type/static-checks + all
  tests, across every language in the repo (see `coding-standards.md` for the per-language
  toolchain and the pre-commit hook that enforces it). Review correctness-critical logic by hand
  too — passing tests are necessary, not sufficient.
- **While iterating, use file-scoped checks** (run the one test, lint the one file) for fast
  feedback; save the full gate for the commit boundary.
- **Evidence, not assertions.** A "done" or "passing" claim comes with the actual output — the
  test run, the exit code, the log lines — quoted, not summarized from memory. Never weaken,
  skip, or delete a check to make the gate pass; fix the root cause.
- **Keep a paper trail when you run.** Capture and keep the logs/test output (and prints where apt)
  from each run, so a failure can be diagnosed from the recorded evidence — not by guessing or
  re-running to reproduce. This only pays off if the code is instrumented for it (see
  `coding-standards.md`: *leave a paper trail*).
- **Verify end-to-end in the real environment** before calling it done. Reproduce and fix issues
  with research, not guesses.
