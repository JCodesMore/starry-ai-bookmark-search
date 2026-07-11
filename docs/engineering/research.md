# Research discipline — evidence over memory

**Load when:** choosing any library, version, API, config, or "best practice."

- For any load-bearing decision, **look it up before deciding**: context7 for library docs, web
  search for approaches/comparisons — then confirm against the *actual* installed source or the
  official template/starter. Cross-check when sources disagree.
- Verify exact versions and current APIs (npm/PyPI/etc., official docs, the installed `.d.ts` or
  source). Training knowledge is outdated, partial, or wrong — don't ship on it.
- Prefer modern, well-supported, actively-maintained choices; weigh supply-chain/security posture.
- When research contradicts your assumption, **research wins** — fix the code, the docs, and memory.
- **Record what you chose, why, and the rejected alternatives** in `docs/decisions/` so it isn't
  re-litigated later (see `memory-and-docs.md`).
- Delegate deep/independent research to a well-briefed subagent to preserve main context
  (see `delegation-and-context.md`).
