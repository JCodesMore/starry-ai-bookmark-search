// Index lifecycle orchestration: ingest → heuristic tags → embed stale records
// → persist vectors, with progress persisted so the popup can show status and
// an interrupted run resumes where it left off (records are marked as they go).
import { diag } from './diag';
import { ingestAllBookmarks } from './ingest';
import { heuristicTags } from './taxonomy';
import { applyZeroShotTags } from './tagger';
import { applyLearnedTopics } from './topics';
import { saveVectors } from './vectors';
import { clearQueue, enqueueFetches, processQueue, registerCrawlAlarm } from './queue';
import { getPrefs } from './prefs';
import { hasCrawlConsent } from './crawl-consent';
import { getAllRecords, getMeta, putRecords, setMeta } from './storage';
import { FETCH_STATUS, INDEX_PHASE, type BookmarkRecord, type IndexProgress } from './types';
import type { EmbeddingProvider } from './embedder/provider';

const PROGRESS_KEY = 'indexProgress';
const EMBED_CHUNK_SIZE = 32;

export function getIndexProgress(): Promise<IndexProgress | undefined> {
  return getMeta<IndexProgress>(PROGRESS_KEY);
}

async function writeProgress(progress: IndexProgress): Promise<void> {
  await setMeta(PROGRESS_KEY, progress);
}

let running: Promise<IndexProgress> | null = null;
let rerunQueued = false;
/** Bumped by invalidateIndexing(); in-flight passes compare their captured
 * value and stop before their next write. */
let generation = 0;

/** Idempotent full pass: cheap when nothing is stale. Concurrent calls
 * coalesce, but a call arriving MID-pass queues one trailing rerun — its
 * caller may have just changed prefs that the in-flight pass already read
 * (exclusions must never be silently skipped). */
export function runFullIndex(
  provider: EmbeddingProvider,
  onProgress?: (p: IndexProgress) => void,
): Promise<IndexProgress> {
  if (running) {
    rerunQueued = true;
    return running;
  }
  running = (async () => {
    try {
      let progress = await doRunFullIndex(provider, onProgress);
      while (rerunQueued) {
        rerunQueued = false;
        progress = await doRunFullIndex(provider, onProgress);
      }
      return progress;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function doRunFullIndex(
  provider: EmbeddingProvider,
  onProgress?: (p: IndexProgress) => void,
): Promise<IndexProgress> {
  const startedAt = Date.now();
  const progress: IndexProgress = {
    phase: INDEX_PHASE.Ingesting,
    processed: 0,
    total: 0,
    failed: 0,
    startedAt,
    updatedAt: startedAt,
  };
  const gen = generation;
  const publish = async () => {
    progress.updatedAt = Date.now();
    await writeProgress(progress);
    onProgress?.(progress);
  };
  await publish();

  const prefs = await getPrefs();
  await ingestAllBookmarks(new Set(prefs.excludedFolderIds));
  if (gen !== generation) return progress; // cancelled mid-pass — stop writing

  // Heuristic tags are cheap and authoritative for known domains (decision 004).
  const records = await getAllRecords();
  const tagUpdates: BookmarkRecord[] = [];
  for (const record of records) {
    if (record.tags.length) continue;
    const tags = heuristicTags(record.canonicalUrl);
    if (tags.length) tagUpdates.push({ ...record, tags: [...tags], updatedAt: Date.now() });
  }
  if (tagUpdates.length) await putRecords(tagUpdates);

  const fresh = await getAllRecords();
  const stale = fresh.filter((r) => r.modelVersion !== provider.modelVersion && r.compositeText);
  if (stale.length) diag('index-pass', `embedding ${stale.length} stale of ${fresh.length}`);
  progress.phase = INDEX_PHASE.Embedding;
  progress.total = stale.length;
  await publish();

  for (let i = 0; i < stale.length; i += EMBED_CHUNK_SIZE) {
    if (gen !== generation) return progress; // cancelled mid-pass — stop writing
    const chunk = stale.slice(i, i + EMBED_CHUNK_SIZE);
    try {
      const vectors = await provider.embedDocuments(chunk.map((r) => r.compositeText));
      await saveVectors(
        chunk.map((record, j) => ({
          id: record.id,
          vector: vectors[j] as Float32Array,
          modelVersion: provider.modelVersion,
        })),
      );
      await putRecords(
        chunk.map((r) => ({ ...r, modelVersion: provider.modelVersion, updatedAt: Date.now() })),
      );
      progress.processed += chunk.length;
    } catch (err) {
      // One bad chunk must not kill the run — log with context, count, move on.
      console.error(`[Starry] embed chunk failed at offset ${i}:`, err);
      progress.failed += chunk.length;
    }
    await publish();
  }

  if (gen !== generation) {
    diag('index-pass-cancelled', `at tagging gate, ${progress.processed}/${progress.total}`);
    return progress; // cancelled mid-pass — stop writing
  }

  // Zero-shot tags ride on the vectors we just stored — near-zero marginal cost.
  progress.phase = INDEX_PHASE.Tagging;
  await publish();
  try {
    const tagged = await applyZeroShotTags(provider);
    if (tagged) diag('tagging-done', `${tagged} records`);
    console.log(`[Starry] zero-shot tagged ${tagged} records`);
  } catch (err) {
    console.error('[Starry] zero-shot tagging failed (non-fatal):', err);
  }

  // Learned topics also reuse the stored vectors (no model calls): a full
  // recluster only on drift/version change, otherwise near-free assignment.
  if (gen !== generation) return progress; // cancelled mid-pass — stop writing
  try {
    const learned = await applyLearnedTopics(provider.modelVersion);
    if (learned) console.log(`[Starry] learned topics stamped ${learned} records`);
  } catch (err) {
    console.error('[Starry] learned topics failed (non-fatal):', err);
  }

  progress.phase = INDEX_PHASE.Done;
  await publish();
  if (progress.total) {
    diag('index-pass-done', `embedded ${progress.processed}, failed ${progress.failed}`);
  }
  return progress;
}

let enriching: Promise<void> | null = null;
let enrichmentAbort: AbortController | null = null;

/** True while THIS service worker has a pass or enrichment in flight. Persisted
 * progress with a non-terminal phase but no active pass is an epitaph from a
 * dead SW — the caller should resume, not display it as live forever. */
export function isIndexingActive(): boolean {
  return running !== null || enriching !== null;
}

/** Stops in-flight page fetches (the crawl consent was just revoked). In-flight
 * requests finish; nothing new starts. The queue itself is cleared by the next
 * enrichment entry's consent gate. */
export function abortEnrichment(): void {
  enrichmentAbort?.abort();
}

/**
 * Cancels all in-flight index work: the running pass exits at its next
 * checkpoint, queued reruns are dropped, and in-flight crawl fetches abort.
 * Reset-data needs this — a chunk landing AFTER the wipe would resurrect a
 * zombie partial index (and re-latch the onboarded grandfather).
 */
export function invalidateIndexing(): void {
  generation += 1;
  rerunQueued = false;
  abortEnrichment();
  diag('invalidate-indexing');
}

/** Resolves once every in-flight pass has fully exited (they exit fast after
 * invalidateIndexing). Only then is it safe to wipe storage. */
export async function settleIndexing(): Promise<void> {
  await Promise.allSettled([running, enriching]);
}

/**
 * Slow background stage, deliberately AFTER the fast baseline pass so search
 * is usable within a minute of install: crawl pages for meta/content signals,
 * then re-embed + re-tag only the records whose composite text changed.
 * Idempotent and resumable — the crawl alarm re-enters here after SW death.
 */
export function runEnrichment(provider: EmbeddingProvider): Promise<void> {
  enriching ??= doRunEnrichment(provider).finally(() => {
    enriching = null;
  });
  return enriching;
}

async function doRunEnrichment(provider: EmbeddingProvider): Promise<void> {
  const gen = generation;
  // Crawl consent gate (onboarding/settings + the live host permission): only
  // the network-using enrichment is gated — the baseline title/url/folder
  // index is gated on onboarding completion instead (background.ts), never on
  // crawl consent.
  if (!(await hasCrawlConsent())) {
    await clearQueue();
    return;
  }
  const records = await getAllRecords();
  const pendingIds = records.filter((r) => r.fetchStatus === FETCH_STATUS.Pending).map((r) => r.id);
  const total = await enqueueFetches(pendingIds);
  if (!total) return;
  registerCrawlAlarm();

  const startedAt = Date.now();
  const progress: IndexProgress = {
    phase: INDEX_PHASE.Fetching,
    processed: 0,
    total,
    failed: 0,
    startedAt,
    updatedAt: startedAt,
  };
  // Progress writes are serialized and generation-guarded: onProgress fires from
  // concurrent fetch workers, and an unordered late write could otherwise land
  // AFTER the tail pass's terminal Done and stick the status line forever.
  let writeChain: Promise<void> = Promise.resolve();
  let wroteFetching = false;
  const queueWrite = () => {
    const snapshot = { ...progress };
    writeChain = writeChain.then(() => (gen === generation ? writeProgress(snapshot) : undefined));
  };

  enrichmentAbort = new AbortController();
  const result = await processQueue({
    signal: enrichmentAbort.signal,
    onProgress: (done, queueTotal) => {
      // Written lazily on the FIRST real attempt: an alarm tick where every
      // entry is still backing off must not flash a status line at all.
      wroteFetching = true;
      progress.processed = done;
      progress.total = queueTotal;
      progress.updatedAt = Date.now();
      queueWrite();
    },
  });
  await writeChain;
  if (result.fetched || result.failed) {
    diag(
      'enrichment',
      `fetched ${result.fetched}, dead ${result.failed}, deferred ${result.deferred}`,
    );
  }
  console.log(
    `[Starry] enrichment crawl: ${result.fetched} fetched, ${result.failed} dead, ${result.deferred} deferred`,
  );
  registerCrawlAlarm(); // clears the alarm when drained, keeps it when deferred

  if (gen !== generation) return; // cancelled mid-crawl — the reset owns the meta store now

  // Second index pass embeds only contentHash-changed records (incremental) —
  // but only when something was actually fetched. Failure/deferral-only waves
  // change no composite text, and the no-op tail pass would flash the status
  // line ("Indexing…" for a second) on every 60s alarm tick while a site backs off.
  if (result.fetched > 0) {
    await runFullIndex(provider);
  } else if (wroteFetching) {
    // We showed Fetching progress but nothing follows — close it out ourselves.
    progress.phase = INDEX_PHASE.Done;
    progress.updatedAt = Date.now();
    queueWrite();
    await writeChain;
  }
}
