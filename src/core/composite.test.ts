import { describe, expect, it } from 'vitest';
import { buildCompositeText } from './composite';
import type { PageSignals } from './types';

type Input = Parameters<typeof buildCompositeText>[0];

function makeInput(
  overrides: Partial<Omit<Input, 'signals'>> & { signals?: PageSignals } = {},
): Input {
  return {
    title: 'Example Title',
    url: 'https://example.com/page',
    folderPath: 'Bookmarks bar',
    signals: {},
    ...overrides,
  };
}

describe('buildCompositeText', () => {
  it('produces a useful baseline text from title + URL + folder alone', () => {
    const text = buildCompositeText(makeInput());
    expect(text).toContain('Example Title');
    expect(text).toContain('Bookmarks bar');
    expect(text.length).toBeGreaterThan(0);
  });

  it('assembles every signal in decision-002 priority order', () => {
    const text = buildCompositeText(
      makeInput({
        title: 'Home',
        signals: {
          ogTitle: 'Home Page',
          metaDescription: 'A description of the page.',
          siteName: 'Example Inc',
          headings: ['Welcome', 'Get Started'],
          excerpt: 'Some excerpt body text.',
        },
      }),
    );

    expect(text).toContain('Home Home Page');
    expect(text).toContain('A description of the page.');
    expect(text).toContain('Example Inc');
    expect(text).toContain('Welcome Get Started');
    expect(text).toContain('Some excerpt body text.');

    expect(text.indexOf('Home')).toBeLessThan(text.indexOf('A description'));
    expect(text.indexOf('A description')).toBeLessThan(text.indexOf('Example Inc'));
    expect(text.indexOf('Example Inc')).toBeLessThan(text.indexOf('Welcome'));
    expect(text.indexOf('Welcome')).toBeLessThan(text.indexOf('Some excerpt'));
  });

  it('de-duplicates repeated strings, e.g. title === og:title', () => {
    const text = buildCompositeText(
      makeInput({ title: 'Same Title', signals: { ogTitle: 'Same Title' } }),
    );
    const occurrences = text.split('Same Title').length - 1;
    expect(occurrences).toBe(1);
  });

  it('de-duplicates a heading that repeats the title', () => {
    const text = buildCompositeText(
      makeInput({
        title: 'Getting Started',
        signals: { headings: ['Getting Started', 'Install'] },
      }),
    );
    expect(text.split('Getting Started').length - 1).toBe(1);
    expect(text).toContain('Install');
  });

  it('extracts clean URL path tokens and drops the TLD', () => {
    const text = buildCompositeText(
      makeInput({ title: 'x', url: 'https://github.com/foo/bar-baz', folderPath: 'y' }),
    );
    expect(text).toContain('github foo bar baz');
  });

  it('drops numeric and hash-like URL tokens', () => {
    const text = buildCompositeText(
      makeInput({
        title: 'x',
        url: 'https://example.com/posts/1234/a1b2c3d4e5f6abcd',
        folderPath: 'y',
      }),
    );
    expect(text).not.toContain('1234');
    expect(text).not.toContain('a1b2c3d4e5f6abcd');
    expect(text).toContain('example posts');
  });

  it('caps the excerpt to ~300 words', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = buildCompositeText(makeInput({ signals: { excerpt: words.join(' ') } }));
    const excerptLine = text.split('\n').find((line) => line.startsWith('word0 '));
    expect(excerptLine).toBeDefined();
    expect(excerptLine?.split(' ').length).toBeLessThanOrEqual(300);
  });

  it('caps total composite length to ~2000 chars', () => {
    const longExcerpt = 'lorem ipsum dolor sit amet '.repeat(500);
    const text = buildCompositeText(
      makeInput({
        signals: {
          metaDescription: 'd'.repeat(500),
          excerpt: longExcerpt,
          headings: ['h'.repeat(200)],
        },
      }),
    );
    expect(text.length).toBeLessThanOrEqual(2000);
  });

  it('still returns text when the URL is unparseable', () => {
    const text = buildCompositeText(
      makeInput({ title: 'Local File', url: 'not a url', folderPath: 'z' }),
    );
    expect(text).toContain('Local File');
    expect(text).toContain('z');
  });
});
