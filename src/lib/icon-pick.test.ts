import { describe, expect, it } from 'vitest';
import { findIconLinks, pickBestIconUrl, type IconLinkCandidate } from './icon-pick';

const BASE = 'https://example.com/deep/page';

function candidate(overrides: Partial<IconLinkCandidate> & { href: string }): IconLinkCandidate {
  return { rel: 'icon', ...overrides };
}

describe('pickBestIconUrl', () => {
  it('resolves relative hrefs against the page url', () => {
    expect(pickBestIconUrl([candidate({ href: '/fav.png' })], BASE)).toBe(
      'https://example.com/fav.png',
    );
    expect(pickBestIconUrl([candidate({ href: 'fav.png' })], BASE)).toBe(
      'https://example.com/deep/fav.png',
    );
  });

  it('prefers the size closest to 32px', () => {
    const picked = pickBestIconUrl(
      [
        candidate({ href: '/fav-16.png', sizes: '16x16' }),
        candidate({ href: '/fav-32.png', sizes: '32x32' }),
        candidate({ href: '/fav-192.png', sizes: '192x192' }),
      ],
      BASE,
    );
    expect(picked).toBe('https://example.com/fav-32.png');
  });

  it('treats scalable icons (any / svg) as nearly ideal', () => {
    const picked = pickBestIconUrl(
      [
        candidate({ href: '/fav-16.png', sizes: '16x16' }),
        candidate({ href: '/fav.svg', type: 'image/svg+xml' }),
      ],
      BASE,
    );
    expect(picked).toBe('https://example.com/fav.svg');
  });

  it('prefers any standard icon over apple-touch-icon, but takes apple as last resort', () => {
    const both = pickBestIconUrl(
      [
        candidate({ href: '/apple.png', rel: 'apple-touch-icon', sizes: '180x180' }),
        candidate({ href: '/fav.ico', rel: 'shortcut icon' }),
      ],
      BASE,
    );
    expect(both).toBe('https://example.com/fav.ico');

    const appleOnly = pickBestIconUrl(
      [candidate({ href: '/apple.png', rel: 'apple-touch-icon-precomposed' })],
      BASE,
    );
    expect(appleOnly).toBe('https://example.com/apple.png');
  });

  it('ignores mask-icon, non-icon rels, data: URIs and malformed hrefs', () => {
    expect(
      pickBestIconUrl(
        [
          candidate({ href: '/mask.svg', rel: 'mask-icon' }),
          candidate({ href: '/style.css', rel: 'stylesheet' }),
          candidate({ href: 'data:image/png;base64,AAAA' }),
        ],
        BASE,
      ),
    ).toBeUndefined();
    expect(pickBestIconUrl([candidate({ href: 'http://[bad' })], BASE)).toBeUndefined();
  });
});

describe('findIconLinks', () => {
  it('harvests link tags across quoting styles and attribute orders', () => {
    const html = `
      <html><head>
        <link href="/a.png" rel="icon" sizes="32x32">
        <link rel='shortcut icon' href='/b.ico'>
        <link rel=apple-touch-icon href=/c.png>
        <link rel="stylesheet" href="/style.css">
        <meta name="description" content="not a link">
      </head></html>`;
    const links = findIconLinks(html);
    expect(links).toEqual([
      { href: '/a.png', rel: 'icon', sizes: '32x32' },
      { href: '/b.ico', rel: 'shortcut icon' },
      { href: '/c.png', rel: 'apple-touch-icon' },
      { href: '/style.css', rel: 'stylesheet' },
    ]);
  });

  it('feeds pickBestIconUrl end to end', () => {
    const html = '<link rel="icon" href="/img/fav-32.png" sizes="32x32">';
    expect(pickBestIconUrl(findIconLinks(html), 'https://site.test/')).toBe(
      'https://site.test/img/fav-32.png',
    );
  });

  it('skips tags missing rel or href', () => {
    expect(findIconLinks('<link rel="icon"><link href="/x.png">')).toEqual([]);
  });
});
