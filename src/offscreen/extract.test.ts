// Unit tests for the pure string/normalization helpers in extract.ts.
// DOM-dependent assembly (extractSignals, parseHtml) needs a real DOMParser/Readability pass and
// is covered by the CDP dev loop instead — the vitest environment here is plain 'node'.
import { describe, expect, it } from 'vitest';
import { capWords, collapseWhitespace, dedupeHeadings, firstNonEmpty } from './extract';

describe('collapseWhitespace', () => {
  it('collapses runs of spaces, tabs, and newlines into one space', () => {
    expect(collapseWhitespace('a   b\t\tc\n\nd')).toBe('a b c d');
  });

  it('trims leading and trailing whitespace', () => {
    expect(collapseWhitespace('  hello world  ')).toBe('hello world');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(collapseWhitespace('   \n\t  ')).toBe('');
  });

  it('leaves already-clean text unchanged', () => {
    expect(collapseWhitespace('clean text')).toBe('clean text');
  });
});

describe('capWords', () => {
  it('keeps text unchanged when under the word cap', () => {
    expect(capWords('one two three', 5)).toBe('one two three');
  });

  it('truncates to exactly the word cap', () => {
    expect(capWords('one two three four five six', 3)).toBe('one two three');
  });

  it('returns an empty string for empty input', () => {
    expect(capWords('', 10)).toBe('');
  });

  it('ignores stray empty tokens from repeated separators', () => {
    expect(capWords('one  two', 5)).toBe('one two');
  });

  it('returns everything when the cap exceeds the word count', () => {
    expect(capWords('a b', 300)).toBe('a b');
  });
});

describe('firstNonEmpty', () => {
  it('returns the first defined, non-blank candidate', () => {
    expect(firstNonEmpty(undefined, '', '  ', 'value', 'later')).toBe('value');
  });

  it('trims the chosen candidate', () => {
    expect(firstNonEmpty('  padded  ')).toBe('padded');
  });

  it('returns undefined when every candidate is empty, null, or missing', () => {
    expect(firstNonEmpty(undefined, null, '', '   ')).toBeUndefined();
  });

  it('returns undefined for a call with no candidates', () => {
    expect(firstNonEmpty()).toBeUndefined();
  });
});

describe('dedupeHeadings', () => {
  it('trims and drops empty or whitespace-only headings', () => {
    expect(dedupeHeadings(['  Intro  ', '', '   '], 5)).toEqual(['Intro']);
  });

  it('deduplicates case-insensitively, keeping the first occurrence casing', () => {
    expect(dedupeHeadings(['Overview', 'overview', 'OVERVIEW'], 5)).toEqual(['Overview']);
  });

  it('caps the result at maxCount', () => {
    expect(dedupeHeadings(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });

  it('preserves first-seen order for distinct headings', () => {
    expect(dedupeHeadings(['Setup', 'Usage', 'API'], 5)).toEqual(['Setup', 'Usage', 'API']);
  });
});
