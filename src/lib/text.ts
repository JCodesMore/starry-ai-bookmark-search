// Shared pure text utilities (importable by both core/ and popup/).

const MIN_TOKEN_LENGTH = 2;

export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= MIN_TOKEN_LENGTH) seen.add(raw);
  }
  return [...seen];
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
