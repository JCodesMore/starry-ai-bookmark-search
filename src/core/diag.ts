// Persistent diagnostics ring buffer. The MV3 service worker is mortal and its
// console dies with it — this survives in the meta store so "what has the
// indexer actually been doing?" is answerable after the fact (tools/diag.mjs).
// Events are pass boundaries and triggers, not per-item spam: cheap enough to
// leave on permanently.
import { getMeta, setMeta } from './storage';

const DIAG_KEY = 'diagLog';
const DIAG_MAX_ENTRIES = 200;

export type DiagEntry = { ts: number; event: string; detail?: string };

// Serialized read-modify-write so concurrent events can't lose each other.
// No in-memory cache: clearAll() (factory reset) wipes the meta store and a
// cached copy would resurrect pre-reset entries on the next write.
let chain: Promise<void> = Promise.resolve();

/** Fire-and-forget log of one lifecycle event. Never throws, never blocks. */
export function diag(event: string, detail?: string): void {
  chain = chain
    .then(async () => {
      const entries = (await getMeta<DiagEntry[]>(DIAG_KEY)) ?? [];
      const entry: DiagEntry = { ts: Date.now(), event };
      if (detail !== undefined) entry.detail = detail;
      entries.push(entry);
      if (entries.length > DIAG_MAX_ENTRIES) entries.splice(0, entries.length - DIAG_MAX_ENTRIES);
      await setMeta(DIAG_KEY, entries);
    })
    .catch(() => undefined); // diagnostics must never break the pipeline they observe
}

export async function getDiagLog(): Promise<DiagEntry[]> {
  await chain; // let queued writes land so the dump reflects "now"
  return (await getMeta<DiagEntry[]>(DIAG_KEY)) ?? [];
}
