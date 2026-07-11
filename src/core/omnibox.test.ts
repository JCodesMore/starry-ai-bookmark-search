import { describe, expect, it } from 'vitest';
import { buildSuggestions, escapeXml, markMatches, OMNIBOX_MAX_SUGGESTIONS } from './omnibox';
import type { ScoredHit } from './types';

function hit(id: string, title: string, url: string): ScoredHit {
  return {
    id,
    title,
    url,
    score: 1,
    reason: 'title',
    tags: [],
    folderPath: '',
    dateAdded: 0,
  } as ScoredHit;
}

describe('escapeXml', () => {
  it('escapes all five XML-significant characters', () => {
    expect(escapeXml(`<a href="x">'R&D'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;R&amp;D&apos;&lt;/a&gt;',
    );
  });
});

describe('markMatches', () => {
  it('wraps query-token hits in <match> and escapes everything else', () => {
    expect(markMatches('AI & Tools <fast>', 'ai')).toBe(
      '<match>AI</match> &amp; Tools &lt;fast&gt;',
    );
  });

  it('extends matches to the full word (prefix model, like the popup)', () => {
    expect(markMatches('Best Tools', 'tool')).toBe('Best <match>Tools</match>');
  });

  it('returns plain escaped text when the query has no tokens', () => {
    expect(markMatches('a & b', '??')).toBe('a &amp; b');
  });
});

describe('buildSuggestions', () => {
  it('caps at the omnibox limit and dedupes by URL', () => {
    const hits = [
      hit('1', 'Dup A', 'https://same.example/'),
      hit('2', 'Dup B', 'https://same.example/'),
      ...Array.from({ length: 10 }, (_, i) => hit(`u${i}`, `Title ${i}`, `https://x.example/${i}`)),
    ];
    const suggestions = buildSuggestions(hits, 'title');
    expect(suggestions).toHaveLength(OMNIBOX_MAX_SUGGESTIONS);
    expect(suggestions[0]?.content).toBe('https://same.example/');
    expect(new Set(suggestions.map((s) => s.content)).size).toBe(suggestions.length);
  });

  it('produces only the three allowed tags — user text cannot smuggle markup', () => {
    const [s] = buildSuggestions(
      [hit('1', 'R&D <match> tricks', 'https://a.example/?q=1&b=2')],
      'tricks',
    );
    const stripped = (s?.description ?? '').replace(/<\/?(?:match|dim|url)>/g, '');
    expect(stripped.includes('<')).toBe(false);
    expect(stripped).toContain('R&amp;D');
    expect(s?.description).toContain('<match>tricks</match>');
    expect(s?.description).toContain('<url>https://a.example/?q=1&amp;b=2</url>');
  });

  it('falls back to the URL as the visible text for untitled bookmarks', () => {
    const [s] = buildSuggestions([hit('1', '', 'https://plain.example/')], 'plain');
    expect(s?.description.startsWith('<match>plain</match>')).toBe(false); // url text, not bare token
    expect(s?.description).toContain('plain.example');
  });
});
