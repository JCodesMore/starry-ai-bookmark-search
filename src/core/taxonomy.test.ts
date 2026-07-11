import { describe, expect, it } from 'vitest';
import { DOMAIN_TAGS, TAXONOMY, domainTagsAreReferentiallyValid, heuristicTags } from './taxonomy';

describe('taxonomy referential integrity', () => {
  it('every DOMAIN_TAGS id resolves to a real TAXONOMY entry', () => {
    expect(domainTagsAreReferentiallyValid()).toBe(true);
  });

  it('has no duplicate tag ids', () => {
    const ids = TAXONOMY.map((tag) => tag.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate DOMAIN_TAGS ids per entry', () => {
    for (const [domain, ids] of Object.entries(DOMAIN_TAGS)) {
      expect(new Set(ids).size, `${domain} has duplicate tag ids`).toBe(ids.length);
    }
  });

  it('ids are kebab-case and labels are non-empty Title Case', () => {
    for (const tag of TAXONOMY) {
      expect(tag.id).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
      expect(tag.label.length).toBeGreaterThan(0);
      expect(tag.description.length).toBeGreaterThan(0);
    }
  });

  it('lands within the ~45-60 tag budget', () => {
    expect(TAXONOMY.length).toBeGreaterThanOrEqual(45);
    expect(TAXONOMY.length).toBeLessThanOrEqual(60);
  });
});

describe('heuristicTags', () => {
  it('tags a plain GitHub repo URL as dev-repos', () => {
    expect(heuristicTags('https://github.com/facebook/react')).toEqual(['dev-repos']);
  });

  it('adds dev-help for GitHub issue threads (path-pattern refinement)', () => {
    expect(heuristicTags('https://github.com/facebook/react/issues/123')).toEqual([
      'dev-repos',
      'dev-help',
    ]);
  });

  it('adds dev-help for GitHub pull requests', () => {
    expect(heuristicTags('https://github.com/facebook/react/pull/456')).toEqual([
      'dev-repos',
      'dev-help',
    ]);
  });

  it('resolves a meaningful subdomain distinctly from its parent domain', () => {
    expect(heuristicTags('https://gist.github.com/someone/abc123')).toEqual([
      'dev-repos',
      'dev-tools',
    ]);
  });

  it('falls back to the registrable domain for unlisted subdomains', () => {
    // mejrs.github.io isn't in DOMAIN_TAGS directly; falls back to the "github.io" entry.
    expect(heuristicTags('https://mejrs.github.io/osrs-tools/')).toEqual(['dev-docs']);
    // old.reddit.com falls back to the "reddit.com" entry.
    expect(heuristicTags('https://old.reddit.com/r/programming')).toEqual(['forums']);
  });

  it('tags both youtube.com/watch and youtube.com/channel as video', () => {
    expect(heuristicTags('https://youtube.com/watch?v=abc123')).toEqual(['video']);
    expect(heuristicTags('https://youtube.com/channel/UC12345')).toEqual(['video']);
  });

  it('tags a well-known AI chat domain', () => {
    expect(heuristicTags('https://chatgpt.com/c/some-conversation')).toEqual(['ai-chat']);
  });

  it('distinguishes a meaningful AWS subdomain from bare amazon.com', () => {
    expect(heuristicTags('https://aws.amazon.com/s3/')).toEqual(['cloud-hosting', 'dev-docs']);
    expect(heuristicTags('https://amazon.com/dp/B0EXAMPLE')).toEqual(['shopping']);
  });

  it('tags corpus-specific game-automation domains', () => {
    expect(heuristicTags('https://dreambot.org/forums/topic/12345')).toEqual(['game-automation']);
    expect(heuristicTags('https://osbot.org/forum/')).toEqual(['game-automation']);
  });

  it('applies google.com path-prefix refinements for an otherwise-ambiguous domain', () => {
    expect(heuristicTags('https://google.com/maps/place/somewhere')).toEqual(['travel']);
    expect(heuristicTags('https://google.com/search?q=cats')).toEqual([]);
  });

  it('strips a leading www. defensively even on non-canonicalized input', () => {
    expect(heuristicTags('https://www.github.com/foo/bar')).toEqual(['dev-repos']);
  });

  it('returns [] for an unknown domain', () => {
    expect(heuristicTags('https://this-domain-does-not-exist-anywhere.example')).toEqual([]);
  });

  it('returns [] for unparsable input instead of throwing', () => {
    expect(heuristicTags('not a url')).toEqual([]);
  });
});
