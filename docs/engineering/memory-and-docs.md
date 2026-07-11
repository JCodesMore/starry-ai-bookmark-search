# Memory & docs — the durable brain

**Load when:** setting up or maintaining memory/docs, or recording a decision.

## Memory (survives compaction)
- Store durable facts: the goal + product decisions, engineering standards/feedback, the locked
  tech stack, hard-won integration details.
- **One fact per file + an index.** Write *before* you risk losing it. Recall after compaction;
  update when decisions change; delete what turns out wrong. Link related facts.
- Don't store what the repo already records (code structure, git history) or chat-only trivia.

## Docs (living engineering artifacts)
- Architecture, specs, flows, setup. Update them as features land so they reflect what's done,
  how testing went, and what's decided — this is how a real team stays aligned.
- **Big decisions go in `docs/decisions/`** — one short file per decision (what was chosen, why,
  rejected alternatives) so the reasoning travels with the repo. Memory stays on one machine;
  these files reach every collaborator and every future session.
- **Docs do double duty:** they're also the context you hand subagents. Keep them brief-able.
- Structure them index → topic files (progressive disclosure): a short index, with detail in
  topic files loaded on demand — don't make one giant always-read file.

## Session resume state (local, gitignored)
A new chat starts empty: Claude Code's in-session task list is tied to the session and isn't carried
into a fresh one. So leave a tiny **local** breadcrumb the next session can read to pick up cleanly.

- **File:** `.claude/session.local.md` — **gitignored** (per-machine state; add it — and
  `.claude/session-log` below — to `.gitignore`).
- **Hold only the moving frontier**, kept compact:
  ```
  session:   <session name — set via /rename; restore later with `claude --resume <name>`>
  repo_root: <absolute path of the main checkout, so a worktree session can find this file>
  phase:   <what's being built now>
  done:    <shipped milestones, short>
  now:     <the one thing in progress> (branch: <branch>)
  next:    <ordered next steps>
  blocked: <blockers, or none>
  ```
- **Refresh it at each milestone** (same beat as committing and updating docs) and **overwrite — it's
  a snapshot, not a log.**
- **Name the session** at kickoff and re-name at major phase changes (`/rename <project>-<phase>`,
  or launch with `claude -n <name>`), and record the name in the breadcrumb. The resume picker
  shows names, and `claude --resume <name>` restores that exact conversation later.
- **Session-id log (hands-free exact restore).** Add a `SessionStart` hook to the project's
  `.claude/settings.json` — *merge* into an existing file, never overwrite it — that appends each
  new session's id to the gitignored `.claude/session-log`:
  ```json
  {"hooks": {"SessionStart": [{"hooks": [{"type": "command",
    "command": "jq -r '.session_id' >> \"$CLAUDE_PROJECT_DIR/.claude/session-log\""}]}]}}
  ```
  The hook receives JSON on stdin; if `jq` isn't installed, read `.session_id` from stdin with a
  one-liner in whatever the project already has (`node -e`, `python -c`). Newest id is the last
  line, so the *previous* session is the line above it — restore any of them with
  `claude --resume <id>`. (No env var exposes the session id to shell commands; this hook is the
  supported way to capture it.)
- **It mirrors the live task list, it doesn't replace it.** Keep using the in-session task tool as
  your working list; this file just captures enough to rehydrate. Durable *facts* (goal, decisions,
  stack) stay in memory above — this is only the progress frontier.
- **On a fresh session**, read this first (the `AGENTS.md` resume reflex). To fully restore the prior
  session instead of starting clean, the *user* can run `claude --continue` (most recent session in
  this directory), `claude --resume <name>` (a named session), or `claude --resume` (pick from a
  list; ids also in `.claude/session-log`).
