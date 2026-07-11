# Cadence, self-audit & collaboration

**Load when:** deciding how often to check in, proposing a big change, or running a periodic audit.

## Cadence
- **Default: steady progress.** Drive the task list, committing verified milestones. Don't stop to
  ask permission after every step (unless the user explicitly wants checkpoints).
- **Big / risky / hard-to-reverse decisions** (architecture, deployment, UX direction): **propose
  first, don't change code yet.** Present the plan, get a go-ahead, then execute. Ask blocking
  questions early.

## Be honest about state
- Say what's done, what's left, what's tested (auto vs. manual), what's still unverified. Surface
  problems instead of glossing. "It works" only after you've watched it work.

## Keep it demoable
- Prioritize a runnable, good-looking result at each milestone — not just passing tests. Think like
  a principal engineer (and a domain expert for the task: game feel, UI/UX, etc.).

## Periodic self-audit (run every so often)
1. Am I using subagents/parallelization where they'd help?
2. Are the docs current with what's actually built?
3. Is memory being used per the methodology?
4. Still adhering to the goal (modular, files strictly under 1,000 LOC and generally capped at ~500 LOC, low coupling, progressive disclosure)?
5. Producing my best-quality work?

Report findings, then fix the gaps.
