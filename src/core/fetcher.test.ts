import { describe, expect, it, vi } from 'vitest';
import { fetchPageSignals } from './fetcher';
import { FETCH_STATUS } from './types';
import type { ExtractResult } from '../offscreen/offscreen';

const MAX_BODY_BYTES = 1_500_000;

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

describe('fetchPageSignals', () => {
  it('returns Dead with detail when the fetch itself rejects (dead link / DNS failure)', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new TypeError('Failed to fetch');
    });

    const outcome = await fetchPageSignals('https://dead.example.com', { fetchFn });

    expect(outcome.status).toBe(FETCH_STATUS.Dead);
    expect(outcome.signals).toEqual({});
    expect(outcome.detail).toContain('Failed to fetch');
  });

  it('returns Dead for a hard HTTP failure status (404)', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const outcome = await fetchPageSignals('https://example.com/missing', { fetchFn });

    expect(outcome.status).toBe(FETCH_STATUS.Dead);
    expect(outcome.signals).toEqual({});
    expect(outcome.detail).toContain('404');
  });

  it('returns Baseline (and skips extraction entirely) for a 200 non-HTML response, e.g. a PDF', async () => {
    const fetchFn = vi.fn(
      async (): Promise<Response> =>
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    );
    const extract = vi.fn(async (): Promise<ExtractResult> => ({ ok: true, signals: {} }));

    const outcome = await fetchPageSignals('https://example.com/file.pdf', { fetchFn, extract });

    expect(outcome.status).toBe(FETCH_STATUS.Baseline);
    expect(outcome.signals).toEqual({});
    expect(extract).not.toHaveBeenCalled();
  });

  it('returns Full and merges the title when extraction finds a readable excerpt', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> =>
      htmlResponse('<html><body>x</body></html>'),
    );
    const extract = vi.fn(async (): Promise<ExtractResult> => ({
      ok: true,
      signals: { excerpt: 'Some readable body text.' },
      title: 'Merged Title',
    }));

    const outcome = await fetchPageSignals('https://example.com/article', { fetchFn, extract });

    expect(outcome.status).toBe(FETCH_STATUS.Full);
    expect(outcome.title).toBe('Merged Title');
    expect(outcome.signals).toEqual({ excerpt: 'Some readable body text.' });
  });

  it('returns MetaOnly when extraction succeeds but finds no excerpt (e.g. a JS-shell SPA)', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> =>
      htmlResponse('<html><body>x</body></html>'),
    );
    const extract = vi.fn(async (): Promise<ExtractResult> => ({
      ok: true,
      signals: { metaDescription: 'A description.' },
    }));

    const outcome = await fetchPageSignals('https://example.com/spa', { fetchFn, extract });

    expect(outcome.status).toBe(FETCH_STATUS.MetaOnly);
    expect(outcome.signals).toEqual({ metaDescription: 'A description.' });
    expect(outcome.title).toBeUndefined();
  });

  describe('regex fallback when the offscreen extractor throws', () => {
    it('finds MetaOnly signals from og:title/og:description/og:site_name', async () => {
      const html = `<html><head>
        <meta property="og:title" content="OG Title Here">
        <meta property="og:description" content="OG Description Here">
        <meta property="og:site_name" content="Example Site">
        <title>Fallback Title</title>
      </head><body></body></html>`;
      const fetchFn = vi.fn(async (): Promise<Response> => htmlResponse(html));
      const extract = vi.fn(async (): Promise<ExtractResult> => {
        throw new Error('offscreen document crashed');
      });

      const outcome = await fetchPageSignals('https://example.com/js-shell', { fetchFn, extract });

      expect(outcome.status).toBe(FETCH_STATUS.MetaOnly);
      expect(outcome.signals).toEqual({
        ogTitle: 'OG Title Here',
        metaDescription: 'OG Description Here',
        siteName: 'Example Site',
      });
      // og:title wins over <title> per the same priority extract.ts uses.
      expect(outcome.title).toBe('OG Title Here');
      expect(outcome.detail).toContain('offscreen document crashed');
    });

    it('falls back further to <title> and plain meta description when no OG tags exist', async () => {
      const html = `<html><head>
        <meta name="description" content="Plain description.">
        <title>Plain Title</title>
      </head><body></body></html>`;
      const fetchFn = vi.fn(async (): Promise<Response> => htmlResponse(html));
      const extract = vi.fn(async (): Promise<ExtractResult> => {
        throw new Error('offscreen document crashed');
      });

      const outcome = await fetchPageSignals('https://example.com/legacy', { fetchFn, extract });

      expect(outcome.status).toBe(FETCH_STATUS.MetaOnly);
      expect(outcome.signals).toEqual({ metaDescription: 'Plain description.' });
      expect(outcome.title).toBe('Plain Title');
    });

    it('falls back to Baseline when nothing is found at all', async () => {
      const html = '<html><head></head><body><p>Hello</p></body></html>';
      const fetchFn = vi.fn(async (): Promise<Response> => htmlResponse(html));
      const extract = vi.fn(async (): Promise<ExtractResult> => {
        throw new Error('offscreen document crashed');
      });

      const outcome = await fetchPageSignals('https://example.com/plain', { fetchFn, extract });

      expect(outcome.status).toBe(FETCH_STATUS.Baseline);
      expect(outcome.signals).toEqual({});
      expect(outcome.title).toBeUndefined();
    });

    it('also falls back when extract resolves with an explicit failure (not a throw)', async () => {
      const html = '<meta property="og:title" content="Resolved Failure Title">';
      const fetchFn = vi.fn(async (): Promise<Response> => htmlResponse(html));
      const extract = vi.fn(async (): Promise<ExtractResult> => ({
        ok: false,
        error: 'DOMParser unavailable',
      }));

      const outcome = await fetchPageSignals('https://example.com/resolved-failure', {
        fetchFn,
        extract,
      });

      expect(outcome.status).toBe(FETCH_STATUS.MetaOnly);
      expect(outcome.signals.ogTitle).toBe('Resolved Failure Title');
      expect(outcome.detail).toContain('DOMParser unavailable');
    });
  });

  it('caps the body handed to extract at ~1.5 MB for an oversized response', async () => {
    const hugeHtml = `<html><body>${'x'.repeat(MAX_BODY_BYTES + 500_000)}</body></html>`;
    const fetchFn = vi.fn(async (): Promise<Response> => htmlResponse(hugeHtml));
    const extract = vi.fn(async (): Promise<ExtractResult> => ({ ok: true, signals: {} }));

    await fetchPageSignals('https://example.com/huge', { fetchFn, extract });

    expect(extract).toHaveBeenCalledTimes(1);
    const [receivedHtml] = extract.mock.calls[0] as unknown as [string, string];
    expect(receivedHtml.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
  });

  it('returns Dead with a timeout detail when the fetch aborts (AbortError)', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    const outcome = await fetchPageSignals('https://example.com/slow', { fetchFn });

    expect(outcome.status).toBe(FETCH_STATUS.Dead);
    expect(outcome.signals).toEqual({});
    expect(outcome.detail).toContain('timed out');
  });
});
