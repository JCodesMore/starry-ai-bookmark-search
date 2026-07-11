# Delegation & context preservation

**Load when:** planning heavy/independent work, delegating to subagents, or deciding what to load.

## Progressive disclosure (the core habit)
- Keep the always-resident surface tiny; pull detail in on demand. Reference children by plain
  path with a one-line *why*, so the right thing loads exactly when needed and nothing else does.
- Apply it everywhere, not just docs:
  - **Code:** small files, clear module seams, import only what's used.
  - **Docs/memory:** index → topic files (this repo's `AGENTS.md` routing is the pattern).
  - **Agent briefs:** link the doc the agent should read; don't inline the whole thing.
  - **Skills/plugins:** lean SKILL.md body; bundle detail as files loaded on demand.

## Subagents
- Use for heavy/independent/exploratory work (research, reading large files/transcripts, building
  independent modules). Keep the main thread for orchestration + correctness-critical work.
- **Brief fully** (assume it knows nothing): goal, standards, relevant files/docs, exact
  deliverable, how to verify. A vague brief produces degraded output.
- **Size the fleet to the task.** A simple lookup = one agent, a few tool calls; a comparison =
  2–4; only genuinely large independent surfaces justify more. Over-spawning burns tokens without
  adding quality.
- After a restart/compaction, use a subagent to read system/transcript files and recover state.

## Parallelization
- Run independent pieces concurrently along the dependency graph while you build the critical
  piece yourself. **Don't** parallelize work that will conflict, or where quality would drop
  because it needs one coherent voice/design.
- **Reads parallelize; writes serialize.** Parallel research/reading is nearly free; parallel
  *edits* to overlapping files collide. Partition writers onto disjoint files or run them one at
  a time.

## Multi-agent orchestration
- Fanning out many agents at once burns tokens fast. Reach for it **only when the user explicitly
  asks for it** — otherwise subagents plus parallel tool calls cover nearly everything.
