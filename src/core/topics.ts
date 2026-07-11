// Cluster-discovered topics ("learned tags"): spherical k-means over the
// ALREADY-stored embedding vectors finds themes the fixed taxonomy can't name,
// and a class-based TF-IDF over member titles/descriptions names each theme in
// the user's own vocabulary. Fully local and model-call-free (clustering reuses
// stored vectors), and nothing here is per-site or per-vocabulary — every label
// is derived from the corpus itself (generalize, never special-case).
//
// Lifecycle: runs at the tail of the Tagging phase. A full recluster happens
// only when the stamp changes or the embedded corpus drifts; between rebuilds,
// new bookmarks are assigned to the nearest existing topic (or none). Learned
// tags live in their own field (BookmarkRecord.learnedTags) so the zero-shot
// tagger's wholesale tag replacement never wipes them.
import { diag } from './diag';
import { getAllRecords, getAllVectors, getMeta, putRecords, setMeta } from './storage';
import { dot, normalize } from './vectors';
import { tokenize } from '../lib/text';
import { FETCH_STATUS, type BookmarkRecord } from './types';

const TOPICS_META_KEY = 'learnedTopics';
/** Bump when the algorithm or labeling scheme changes — forces a recluster. */
const TOPICS_ALGO_VERSION = 3;
/** Below this many embedded bookmarks, "clusters" are noise, not themes. */
const MIN_CORPUS_SIZE = 40;
/** Deterministic seeding: same corpus → same clusters → stable labels. */
const KMEANS_SEED = 1337;
const KMEANS_MAX_ITERATIONS = 30;
const K_MIN = 6;
const K_MAX = 30;
/** A theme needs this many members to be worth naming. */
const MIN_TOPIC_SIZE = 6;
/** Mean member→centroid cosine below this = a grab-bag, not a topic. */
const MIN_TOPIC_COHESION = 0.65;
/** A NEW record joins an existing topic only when it's genuinely close. */
const ASSIGN_MIN_COSINE = 0.62;
/** Recluster when the embedded corpus drifted this much since the last build. */
const REBUILD_DRIFT_FRACTION = 0.1;
const REBUILD_DRIFT_MIN = 25;
/** Labels are at most this many distinctive terms ("runescape botting"). */
const LABEL_TERMS = 2;
const MIN_TERM_LENGTH = 3;
/** A label term must appear in at least this fraction of member docs (and at
 * least MIN_TERM_DOCS) — one spammy page must not name a whole topic. */
const MIN_TERM_DOC_FRACTION = 0.15;
const MIN_TERM_DOCS = 2;
/** Terms sharing this long a prefix are near-duplicates ("proxy"/"proxies"). */
const TERM_PREFIX_DEDUP = 4;
/** Centroids persist rounded — assignment needs direction, not full precision. */
const CENTROID_DECIMALS = 4;

// Generic English + web-chrome noise. This is language plumbing (the class of
// junk labels), not domain vocabulary — no site or topic names belong here.
const STOPWORDS: ReadonlySet<string> = new Set([
  ...(
    'the a an and or but if then else for nor so yet of in on at to from by with without ' +
    'about into over after before between out against during under above below up down off ' +
    'is are was were be been being am do does did done doing have has had having will would ' +
    'shall should can could may might must not no yes this that these those it its they them ' +
    'their there here you your yours we our ours i me my mine he she his her him who whom ' +
    'which what when where why how all any both each few more most other some such only own ' +
    'same than too very just also even ever never now new get got make made using use used ' +
    'one two three first best top free online official home page site website web index ' +
    // Generic product-page filler: words every SaaS/store page says about
    // itself, so they can never DISTINGUISH one theme from another.
    'build built building create creating creator find found tool tools app apps platform ' +
    'software service services product products solution solutions easy simple fast ' +
    'powered powering contribute contributing generate generated'
  ).split(' '),
  // URL/markup fragments that survive tokenization.
  'www',
  'com',
  'org',
  'net',
  'http',
  'https',
  'html',
  'php',
]);

// --- pure math -------------------------------------------------------------

// mulberry32's published constants — the algorithm IS these exact numbers.
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_OR_B = 61;
const MULBERRY_SHIFT_C = 14;
const UINT32_RANGE = 0x100000000;

/** Small deterministic PRNG (mulberry32) so reclustering is reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> MULBERRY_SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> MULBERRY_SHIFT_B), t | MULBERRY_OR_B);
    return ((t ^ (t >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_RANGE;
  };
}

/** k for n points: sqrt(n/2) clamped — enough clusters for themes to separate,
 * few enough that each can clear MIN_TOPIC_SIZE. */
export function chooseK(n: number): number {
  return Math.max(K_MIN, Math.min(K_MAX, Math.round(Math.sqrt(n / 2))));
}

export type ClusterResult = {
  /** Point i belongs to cluster assignments[i]. */
  assignments: Int32Array;
  /** k × dim, row-major, each row L2-normalized. */
  centroids: Float32Array;
  k: number;
};

function indexOfMin(values: Float32Array): number {
  let min = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! < values[min]!) min = i;
  return min;
}

/** Nearest centroid by cosine (rows are L2-normalized ⇒ dot = cosine). */
function nearestCentroid(
  data: Float32Array,
  point: number,
  centroids: Float32Array,
  k: number,
  dim: number,
): { index: number; sim: number } {
  const row = data.subarray(point * dim, (point + 1) * dim);
  let index = 0;
  let sim = -Infinity;
  for (let c = 0; c < k; c++) {
    const s = dot(row, centroids.subarray(c * dim, (c + 1) * dim));
    if (s > sim) {
      sim = s;
      index = c;
    }
  }
  return { index, sim };
}

/** k-means++ init on cosine distance: spread the seeds so one dense region
 * can't swallow every centroid. */
function initCentroids(
  data: Float32Array,
  n: number,
  dim: number,
  k: number,
  rand: () => number,
): Float32Array {
  const centroids = new Float32Array(k * dim);
  const first = Math.floor(rand() * n);
  centroids.set(data.subarray(first * dim, (first + 1) * dim), 0);
  const minDist = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const sim = dot(
        data.subarray(i * dim, (i + 1) * dim),
        centroids.subarray((c - 1) * dim, c * dim),
      );
      const d = 1 - sim;
      const d2 = d * d;
      if (d2 < minDist[i]!) minDist[i] = d2;
      total += minDist[i]!;
    }
    let target = rand() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      target -= minDist[i]!;
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.set(data.subarray(chosen * dim, (chosen + 1) * dim), c * dim);
  }
  return centroids;
}

/**
 * Spherical k-means over packed row-major unit vectors. Deterministic (seeded
 * k-means++), converges or stops at KMEANS_MAX_ITERATIONS, and yields to the
 * event loop each iteration so the service worker stays responsive mid-pass.
 */
export async function sphericalKMeans(
  data: Float32Array,
  n: number,
  dim: number,
  k: number,
): Promise<ClusterResult> {
  const rand = mulberry32(KMEANS_SEED);
  let centroids = initCentroids(data, n, dim, k, rand);
  const assignments = new Int32Array(n).fill(-1);

  for (let iter = 0; iter < KMEANS_MAX_ITERATIONS; iter++) {
    let changed = 0;
    const bestSim = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const { index, sim } = nearestCentroid(data, i, centroids, k, dim);
      bestSim[i] = sim;
      if (assignments[i] !== index) {
        assignments[i] = index;
        changed++;
      }
    }
    if (!changed) break;

    const next = new Float32Array(k * dim);
    const sizes = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignments[i]!;
      sizes[c]!++;
      const row = data.subarray(i * dim, (i + 1) * dim);
      for (let d = 0; d < dim; d++) next[c * dim + d]! += row[d]!;
    }
    for (let c = 0; c < k; c++) {
      if (sizes[c] === 0) {
        // Re-seed a dead centroid on the most orphaned point (worst best-fit).
        const worst = indexOfMin(bestSim);
        next.set(data.subarray(worst * dim, (worst + 1) * dim), c * dim);
        continue;
      }
      normalize(next.subarray(c * dim, (c + 1) * dim));
    }
    centroids = next;
    // Keep the SW's event loop breathing between heavy iterations.
    await new Promise((resolve) => setTimeout(resolve));
  }
  return { assignments, centroids, k };
}

// --- labeling ---------------------------------------------------------------

/** True for tokens worth putting in a human-facing label. */
function isLabelWorthy(token: string): boolean {
  return token.length >= MIN_TERM_LENGTH && !STOPWORDS.has(token) && !/^\d+$/.test(token);
}

/** The tokens a record contributes to its cluster's label: what the page SAYS
 * it is (title + site name + meta description) — never folder names (already a
 * search signal) and never the noisy body excerpt. */
export function topicDocTokens(
  record: Pick<BookmarkRecord, 'title' | 'signals'>,
): readonly string[] {
  const text = [record.title, record.signals.siteName, record.signals.metaDescription]
    .filter(Boolean)
    .join(' ');
  return tokenize(text).filter(isLabelWorthy);
}

/**
 * Names each cluster with its most DISTINCTIVE terms (class-based TF-IDF, the
 * BERTopic idea): a term scores by how common it is inside the cluster times
 * how rare it is across the corpus. Near-duplicate terms ("proxy"/"proxies")
 * collapse; labels are deduped across clusters; null = no honest name exists
 * (the caller drops the topic rather than mislabel it).
 */
export function labelClusters(clusters: readonly (readonly (readonly string[])[])[]): {
  labels: (string | null)[];
} {
  const corpusDocFreq = new Map<string, number>();
  let totalDocs = 0;
  for (const docs of clusters) {
    totalDocs += docs.length;
    for (const doc of docs) {
      for (const term of doc) corpusDocFreq.set(term, (corpusDocFreq.get(term) ?? 0) + 1);
    }
  }
  const avgClusterDocs = totalDocs / Math.max(1, clusters.length);

  const ranked = clusters.map((docs) => {
    const docFreq = new Map<string, number>();
    for (const doc of docs) {
      for (const term of doc) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    const minDocs = Math.max(MIN_TERM_DOCS, Math.ceil(docs.length * MIN_TERM_DOC_FRACTION));
    return [...docFreq.entries()]
      .filter(([, freq]) => freq >= minDocs)
      .map(([term, freq]) => ({
        term,
        score:
          (freq / Math.max(1, docs.length)) *
          Math.log(1 + avgClusterDocs / (corpusDocFreq.get(term) ?? 1)),
      }))
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  });

  const used = new Set<string>();
  const labels = ranked.map((terms) => {
    // Greedy pick, skipping near-duplicates of already-picked terms; extend
    // past LABEL_TERMS only to break a tie with another cluster's label.
    const picked: string[] = [];
    for (const { term } of terms) {
      if (picked.some((p) => p.startsWith(term.slice(0, TERM_PREFIX_DEDUP)))) continue;
      picked.push(term);
      if (picked.length >= LABEL_TERMS) {
        const candidate = picked.join(' ');
        if (!used.has(candidate)) break;
        picked.pop(); // collision — try the next distinct term instead
      }
    }
    if (!picked.length) return null;
    const label = picked.slice(0, LABEL_TERMS).join(' ');
    if (used.has(label)) return null;
    used.add(label);
    return label;
  });
  return { labels };
}

// --- persistence & orchestration ---------------------------------------------

type StoredTopic = { label: string; size: number; cohesion: number; centroid: number[] };
type StoredTopics = {
  stamp: string;
  builtAt: number;
  embeddedCount: number;
  /** Records with real page signals at build time — the enrichment crawl
   * re-embeds records without changing their COUNT, so this is the drift axis
   * that catches "same corpus, different vectors" (e.g. rebuild-after-reset:
   * topics built over baseline vectors must refresh once pages are read). */
  enrichedCount: number;
  topics: StoredTopic[];
};

function topicsStamp(modelVersion: string): string {
  return `v${TOPICS_ALGO_VERSION}#${modelVersion}`;
}

function drifted(before: number, now: number): boolean {
  return (
    Math.abs(now - before) >=
    Math.max(REBUILD_DRIFT_MIN, Math.ceil(before * REBUILD_DRIFT_FRACTION))
  );
}

/** Recluster when the stamp changed (new model/algorithm) or the corpus
 * drifted enough that the old themes may no longer fit — by size (bookmarks
 * added/removed) or by enrichment (same bookmarks, materially new vectors). */
export function needsTopicsRebuild(
  meta: Pick<StoredTopics, 'stamp' | 'embeddedCount' | 'enrichedCount'> | undefined,
  stamp: string,
  embeddedCount: number,
  enrichedCount: number,
): boolean {
  if (!meta || meta.stamp !== stamp) return true;
  // Meta written before this field existed can't prove freshness — rebuild once.
  if (typeof meta.enrichedCount !== 'number') return true;
  return drifted(meta.embeddedCount, embeddedCount) || drifted(meta.enrichedCount, enrichedCount);
}

const round = (x: number): number => Number(x.toFixed(CENTROID_DECIMALS));

/** Persists only records whose learned tag or stamp actually changed. */
async function stampRecords(
  updates: { record: BookmarkRecord; label: string | undefined; stamp: string }[],
): Promise<number> {
  const changed = updates.filter(
    ({ record, label, stamp }) =>
      record.learnedTopicsVersion !== stamp || (record.learnedTags?.[0] ?? undefined) !== label,
  );
  if (changed.length) {
    await putRecords(
      changed.map(({ record, label, stamp }) => ({
        ...record,
        learnedTags: label ? [label] : [],
        learnedTopicsVersion: stamp,
        updatedAt: Date.now(),
      })),
    );
  }
  return changed.length;
}

/** Between rebuilds: give not-yet-stamped records the nearest existing topic
 * (or none when nothing is genuinely close). */
async function assignToStoredTopics(
  meta: StoredTopics,
  stamp: string,
  embedded: { record: BookmarkRecord; vector: Float32Array }[],
): Promise<number> {
  const fresh = embedded.filter(({ record }) => record.learnedTopicsVersion !== stamp);
  if (!fresh.length) return 0;
  const centroids = meta.topics.map((t) => normalize(Float32Array.from(t.centroid)));
  const updates = fresh.map(({ record, vector }) => {
    let best = -1;
    let sim = -Infinity;
    centroids.forEach((c, i) => {
      if (c.length !== vector.length) return;
      const s = dot(vector, c);
      if (s > sim) {
        sim = s;
        best = i;
      }
    });
    const label = best >= 0 && sim >= ASSIGN_MIN_COSINE ? meta.topics[best]?.label : undefined;
    return { record, label, stamp };
  });
  return stampRecords(updates);
}

/**
 * The entry point the indexer calls at the tail of every Tagging phase.
 * Cheap when nothing changed (stamp check → maybe a handful of assignments);
 * a full recluster only on drift or version change. Returns records updated.
 */
export async function applyLearnedTopics(modelVersion: string): Promise<number> {
  const stamp = topicsStamp(modelVersion);
  const [records, vectorRows] = await Promise.all([getAllRecords(), getAllVectors()]);
  const vecById = new Map(
    vectorRows
      .filter((row) => row.modelVersion === modelVersion)
      .map((row) => [row.id, new Float32Array(row.vector)]),
  );
  const embedded = records
    .filter((r) => vecById.has(r.id))
    .map((record) => ({ record, vector: vecById.get(record.id) as Float32Array }));
  if (embedded.length < MIN_CORPUS_SIZE) return 0;
  const enrichedCount = embedded.filter(
    ({ record }) =>
      record.fetchStatus === FETCH_STATUS.Full || record.fetchStatus === FETCH_STATUS.MetaOnly,
  ).length;

  const meta = await getMeta<StoredTopics>(TOPICS_META_KEY);
  if (meta && !needsTopicsRebuild(meta, stamp, embedded.length, enrichedCount)) {
    return assignToStoredTopics(meta, stamp, embedded);
  }

  // --- full rebuild ---
  const n = embedded.length;
  const dim = embedded[0]?.vector.length ?? 0;
  if (!dim) return 0;
  const data = new Float32Array(n * dim);
  embedded.forEach(({ vector }, i) => data.set(vector, i * dim));
  const k = chooseK(n);
  const startedAt = Date.now();
  const { assignments, centroids } = await sphericalKMeans(data, n, dim, k);

  // Cluster stats + member docs for labeling.
  const members: number[][] = Array.from({ length: k }, () => []);
  assignments.forEach((c, i) => members[c]?.push(i));
  const cohesions = members.map((idx, c) => {
    if (!idx.length) return 0;
    const centroid = centroids.subarray(c * dim, (c + 1) * dim);
    const total = idx.reduce(
      (sum, i) => sum + dot(data.subarray(i * dim, (i + 1) * dim), centroid),
      0,
    );
    return total / idx.length;
  });
  const { labels } = labelClusters(
    members.map((idx) => idx.map((i) => topicDocTokens(embedded[i]!.record))),
  );

  // Only coherent, populated, honestly-nameable clusters become topics.
  const topics: StoredTopic[] = [];
  const topicLabelByCluster = new Map<number, string>();
  members.forEach((idx, c) => {
    const label = labels[c];
    if (!label || idx.length < MIN_TOPIC_SIZE || cohesions[c]! < MIN_TOPIC_COHESION) return;
    topicLabelByCluster.set(c, label);
    topics.push({
      label,
      size: idx.length,
      cohesion: round(cohesions[c]!),
      centroid: Array.from(centroids.subarray(c * dim, (c + 1) * dim), round),
    });
  });

  await setMeta(TOPICS_META_KEY, {
    stamp,
    builtAt: Date.now(),
    embeddedCount: n,
    enrichedCount,
    topics,
  } satisfies StoredTopics);

  const updated = await stampRecords(
    embedded.map(({ record }, i) => ({
      record,
      label: topicLabelByCluster.get(assignments[i]!),
      stamp,
    })),
  );
  diag(
    'topics-rebuilt',
    `${topics.length} topics of ${k} clusters over ${n} records in ${Date.now() - startedAt}ms`,
  );
  return updated;
}

// --- diagnostics (tools/topics.mjs) ------------------------------------------

export type TopicsSummary = {
  builtAt: number;
  embeddedCount: number;
  topics: { label: string; size: number; cohesion: number; samples: string[] }[];
};

const SUMMARY_SAMPLES = 4;

export async function getTopicsSummary(): Promise<TopicsSummary | undefined> {
  const meta = await getMeta<StoredTopics>(TOPICS_META_KEY);
  if (!meta) return undefined;
  const records = await getAllRecords();
  const byLabel = new Map<string, string[]>();
  for (const record of records) {
    const label = record.learnedTags?.[0];
    if (!label) continue;
    const titles = byLabel.get(label) ?? [];
    titles.push(record.title);
    byLabel.set(label, titles);
  }
  return {
    builtAt: meta.builtAt,
    embeddedCount: meta.embeddedCount,
    topics: meta.topics
      .map((t) => {
        const titles = byLabel.get(t.label) ?? [];
        return {
          label: t.label,
          size: titles.length,
          cohesion: t.cohesion,
          samples: titles.slice(0, SUMMARY_SAMPLES),
        };
      })
      .sort((a, b) => b.size - a.size),
  };
}
