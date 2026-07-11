// Zero-shot tagging (decision 004): taxonomy descriptions are embedded ONCE
// per model version; a bookmark's tags come from cosine between a dedicated
// tag-input embedding and the tag vectors. Tagging deliberately does NOT reuse
// the search vector: the composite text is dominated by body excerpt (great for
// recall, terrible for classification — About-page marketing boilerplate once
// tagged a Runescape marketplace as "automotive"). Tags classify what a site
// IS, and the author-written title + description say exactly that.
// Domain heuristics (taxonomy.ts) remain authoritative and are merged first.
import { TAXONOMY, TAXONOMY_VERSION, heuristicTags } from './taxonomy';
import { dot } from './vectors';
import { getAllRecords, getMeta, putRecords, setMeta } from './storage';
import type { BookmarkRecord } from './types';
import type { EmbeddingProvider } from './embedder/provider';

const TAX_VECTORS_KEY_PREFIX = 'taxonomyVectors:';
/** Cosine below this is too weak to claim the tag. Tuned via golden harness. */
const ZERO_SHOT_THRESHOLD = 0.45;
/** At most this many zero-shot tags join the (authoritative) heuristic tags. */
const ZERO_SHOT_TOP_K = 2;
const MAX_TAGS_PER_RECORD = 4;
/** Bounded batches keep peak memory flat (same rationale as indexer embedding). */
const TAG_EMBED_CHUNK_SIZE = 32;
/** Bump when the tag-input scheme changes — stored tags older than this recompute. */
const TAG_INPUT_SCHEME = 'title-desc@2';

type TaxonomyVectors = { ids: string[]; vectors: number[][] };

/** Version stamp for stored tags: model identity + tag-input scheme + taxonomy
 * content version, so changing any of the three retriggers tagging. */
export function taggerVersion(provider: EmbeddingProvider): string {
  return `${provider.modelVersion}#${TAG_INPUT_SCHEME}#tax@${TAXONOMY_VERSION}`;
}

/**
 * The short, focused text a record is classified from: what the site says it
 * is (title, meta description, site name) — never the body excerpt. Falls back
 * to the composite text so signal-less baseline records still get a best-effort
 * classification from title/URL/folder tokens.
 */
export function buildTagText(
  record: Pick<BookmarkRecord, 'title' | 'signals' | 'compositeText'>,
): string {
  const parts = [record.title, record.signals.metaDescription, record.signals.siteName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  return parts.length ? parts.join('\n') : record.compositeText;
}

export async function ensureTaxonomyVectors(provider: EmbeddingProvider): Promise<TaxonomyVectors> {
  // Keyed by model AND taxonomy content version — editing a description must
  // re-embed the taxonomy, not serve stale vectors forever.
  const key = `${TAX_VECTORS_KEY_PREFIX}${provider.modelVersion}#tax@${TAXONOMY_VERSION}`;
  const cached = await getMeta<TaxonomyVectors>(key);
  if (cached && cached.ids.length === TAXONOMY.length) return cached;

  const vectors = await provider.embedDocuments(TAXONOMY.map((t) => t.description));
  const fresh: TaxonomyVectors = {
    ids: TAXONOMY.map((t) => t.id),
    vectors: vectors.map((v) => Array.from(v)),
  };
  await setMeta(key, fresh);
  return fresh;
}

export function zeroShotTags(
  recordVector: Float32Array,
  taxonomy: TaxonomyVectors,
  threshold: number = ZERO_SHOT_THRESHOLD,
  topK: number = ZERO_SHOT_TOP_K,
): string[] {
  const scored: { id: string; score: number }[] = [];
  for (let i = 0; i < taxonomy.ids.length; i++) {
    const tagVector = Float32Array.from(taxonomy.vectors[i] ?? []);
    if (tagVector.length !== recordVector.length) continue;
    const score = dot(recordVector, tagVector);
    if (score >= threshold) scored.push({ id: taxonomy.ids[i] as string, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.id);
}

/**
 * (Re)tags every record whose stored tags predate the current tagger version.
 * Tags are REPLACED wholesale (fresh heuristics + fresh zero-shot), never
 * merged onto old ones — otherwise a stale wrong tag could survive forever.
 * Incremental: records already stamped with the current version are skipped,
 * so steady-state passes are near-free.
 */
export async function applyZeroShotTags(provider: EmbeddingProvider): Promise<number> {
  const version = taggerVersion(provider);
  const taxonomy = await ensureTaxonomyVectors(provider);
  const records = await getAllRecords();
  const stale = records.filter((r) => r.tagModelVersion !== version && buildTagText(r).length > 0);

  let updated = 0;
  for (let i = 0; i < stale.length; i += TAG_EMBED_CHUNK_SIZE) {
    const chunk = stale.slice(i, i + TAG_EMBED_CHUNK_SIZE);
    try {
      const vectors = await provider.embedDocuments(chunk.map((r) => buildTagText(r)));
      const updates: BookmarkRecord[] = chunk.map((record, j) => {
        const suggested = zeroShotTags(vectors[j] as Float32Array, taxonomy);
        const tags = [...heuristicTags(record.canonicalUrl)];
        for (const tag of suggested) {
          if (tags.length >= MAX_TAGS_PER_RECORD) break;
          if (!tags.includes(tag)) tags.push(tag);
        }
        return { ...record, tags, tagModelVersion: version, updatedAt: Date.now() };
      });
      await putRecords(updates);
      updated += updates.length;
    } catch (err) {
      // One bad chunk must not kill the pass — log with context, move on.
      console.error(`[Starry] tag chunk failed at offset ${i}:`, err);
    }
  }
  return updated;
}
