import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from './url';

describe('canonicalizeUrl', () => {
  it('lowercases host and strips www', () => {
    expect(canonicalizeUrl('https://WWW.GitHub.com/Foo')).toBe('https://github.com/Foo');
  });

  it('drops the hash fragment', () => {
    expect(canonicalizeUrl('https://a.com/page#section')).toBe('https://a.com/page');
  });

  it('strips tracking params but keeps meaningful ones', () => {
    expect(canonicalizeUrl('https://a.com/p?utm_source=x&id=5&fbclid=abc')).toBe(
      'https://a.com/p?id=5',
    );
  });

  it('sorts remaining query params for stable identity', () => {
    expect(canonicalizeUrl('https://a.com/p?b=2&a=1')).toBe('https://a.com/p?a=1&b=2');
  });

  it('trims trailing slash except on root', () => {
    expect(canonicalizeUrl('https://a.com/docs/')).toBe('https://a.com/docs');
    expect(canonicalizeUrl('https://a.com/')).toBe('https://a.com/');
  });

  it('returns non-URL input trimmed rather than throwing', () => {
    expect(canonicalizeUrl('  not a url  ')).toBe('not a url');
  });

  it('preserves scheme (no forced https)', () => {
    expect(canonicalizeUrl('http://a.com/x')).toBe('http://a.com/x');
  });
});
