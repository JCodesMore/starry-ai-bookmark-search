# Coding standards — enforce in tooling, not vibes

**Load when:** writing code or configuring linters/formatters/type-checkers.

- **No magic numbers** — name every meaningful constant.
- **Name recurring states; don't stringly-type them.** Model a fixed set of labels/statuses as an
  enum (or union / `const` map), so comparisons read `status === OutcomeStatus.ABSENT`, not
  `status === "absent"`. The named form gives you typo-protection, autocomplete, and compiler
  exhaustiveness checks; bare string literals silently rot the moment one copy changes.
- **Guard clauses over nested conditionals.** Return (or throw/continue) early on edge and error
  cases so the happy path stays at one indent level and reads top-to-bottom. Deep `if/else`
  nesting buries the main logic and is where bugs hide.
- **Comment the *why*, not the *what*.** The code already says *what* it does; a comment's job is to
  capture what it can't — the rationale, the invariants, the trade-offs, and the non-obvious reason a
  line exists. Skip comments that merely restate the code (they rot and drift out of sync); leave one
  wherever the next reader would otherwise have to reverse-engineer *why*.
- **Modular** — files strictly under 1,000 LOC and generally capped at ~500 LOC where practical;
  small functions; one concern each.
- **Low coupling + clear boundaries** — enforce import direction with a linter.
- **Abstract at swap points** (DB, transport, third-party seams); systems thinking; extensible by
  design so new features/variants drop in cleanly.
- **Less is more.** The least clean code that fully meets the goal is the target — don't add
  abstraction, indirection, or options before there's a real need (the swap points above are *real*
  seams, not speculative ones). Leanness never excuses sacrificing clarity, correctness, or
  required quality.
- **Refactor as you go; think system-wide.** Tighten logic the moment you touch it so the codebase
  never goes stale. Weigh each change against the whole system, not just the local call site, so a
  quick fix here doesn't become a short-sighted corner you have to undo later.
- **Validate at trust boundaries, then trust inward.** Check and normalize untrusted input *once*,
  where it enters the system — request/transport handlers, message payloads, CLI args, file/DB
  reads, any third-party response — ideally against a schema, so everything inside can assume clean,
  well-typed data. Don't sprinkle re-checks through the interior, and never assume caller or external
  data is well-formed.
- **Strict types on**; handle errors gracefully; build for resilience.
- **Leave a paper trail — make a failure diagnosable from its first run.** Instrument the code
  (structured logging, plus prints/test output where apt) so that when it executes, the output alone
  shows what happened and where it broke — no guessing, no re-running to reproduce, no after-the-fact
  archaeology. Log decisions and state at the boundaries and around risky steps, and make error
  messages carry the context (inputs, ids, the failing operation) needed to pinpoint the cause.
- **Auto-format, don't hand-style.** Adopt one standard formatter per language and let it own all
  layout — it ends style debates and keeps diffs about logic, not whitespace.
- **Make standards a gate — and run the *whole* gate in every language the repo uses.** Wire
  auto-format + lint + type/static-check + tests into one command that fails on any violation, using
  each language's standard toolchain (e.g. Prettier · ESLint · tsc for TS/JS; gofmt · go vet ·
  golangci-lint for Go; rustfmt · clippy for Rust; black/ruff · mypy for Python; and the equivalent
  for anything else in the repo). Keep rules like no-magic-numbers, max-lines, max-depth/complexity,
  and import-boundaries on. Enforced by tooling, not by memory.
- **Bolt the gate to the repo so it physically can't be skipped.** Put the gate command in a git
  pre-commit hook: create `.githooks/pre-commit` (a two-line shell script that just `exec`s the
  gate command), make it executable, and run `git config core.hooksPath .githooks` — git then runs
  it automatically before every commit and refuses the commit if it fails. Never bypass it with
  `--no-verify`; if the gate is wrong, fix the gate. Mirror the same command in CI so the check
  also runs where hooks can't be dodged.
- **Document file-scoped fast checks alongside the full gate** — how to lint one file and run one
  test — so the inner loop stays fast while iterating. The full gate guards the commit boundary,
  not every keystroke.
