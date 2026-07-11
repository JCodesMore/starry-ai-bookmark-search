import { describe, expect, it } from 'vitest';
import { hashText } from './hash';

describe('hashText', () => {
  it('is stable for the same input', () => {
    expect(hashText('hello world')).toBe(hashText('hello world'));
  });

  it('produces a fixed-length lowercase hex string', () => {
    expect(hashText('anything')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different inputs', () => {
    const hashes = new Set(['a', 'b', 'ab', 'ba', 'aa', 'hello', 'Hello'].map(hashText));
    expect(hashes.size).toBe(7);
  });

  it('handles the empty string', () => {
    expect(hashText('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is sensitive to single-character changes', () => {
    expect(hashText('bookmark')).not.toBe(hashText('bookmarks'));
  });

  it('handles unicode input without throwing', () => {
    expect(() => hashText('日本語 emoji 🎉')).not.toThrow();
    expect(hashText('日本語 emoji 🎉')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic across many distinct long inputs', () => {
    const inputs = Array.from({ length: 50 }, (_, i) => `composite-text-sample-${i}`.repeat(20));
    const hashes = new Set(inputs.map(hashText));
    expect(hashes.size).toBe(inputs.length);
  });
});
