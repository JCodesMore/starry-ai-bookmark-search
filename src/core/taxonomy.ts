// Curated tag taxonomy (decision 004). Pure data + tiny lookup helpers — no I/O, no state.
// Descriptions are embedded ONCE and cosine-matched against bookmark composite texts elsewhere
// (tagger.ts, out of scope here), so they read like the bookmarks they should match rather than
// dictionary definitions. DOMAIN_TAGS is the authoritative heuristic table and runs first,
// winning for known hosts (decision 004); zero-shot only fills gaps. Curated against the user's
// real ~1,300-bookmark corpus, which skews heavily toward software dev, GitHub, AI tools, and
// RuneScape game-automation/botting, while staying useful for a general bookmark collection.

export type TaxonomyTag = {
  id: string;
  label: string;
  description: string;
};

/** Bump when tag descriptions change — invalidates cached taxonomy vectors and
 * stored per-record tags (tagger.ts folds this into its version stamp). */
export const TAXONOMY_VERSION = 2;

export const TAXONOMY: readonly TaxonomyTag[] = [
  // --- software development ---
  {
    id: 'dev-repos',
    label: 'Dev Repos',
    description:
      'Source code repositories, git hosting, open source projects, pull requests and code browsing on platforms like GitHub.',
  },
  {
    id: 'dev-docs',
    label: 'Dev Docs',
    description:
      'Official technical documentation, API references, developer guides, SDK docs and changelogs.',
  },
  {
    id: 'dev-tools',
    label: 'Dev Tools',
    description:
      'Developer tools, SDKs, APIs, code libraries, programming utilities and technical documentation.',
  },
  {
    id: 'dev-help',
    label: 'Dev Help',
    description:
      'Programming Q&A, Stack Overflow threads, debugging help and troubleshooting discussions for developers.',
  },
  {
    id: 'cloud-hosting',
    label: 'Cloud Hosting',
    description:
      'Cloud computing platforms, web hosting, servers, domains, CDNs and infrastructure providers.',
  },
  {
    id: 'hardware',
    label: 'Hardware',
    description: 'Computer hardware, PC components, electronics, peripherals and gadget reviews.',
  },
  {
    id: 'browser-extensions',
    label: 'Extensions',
    description: 'Browser extensions, add-ons, plugins and Chrome Web Store listings.',
  },
  // --- AI / ML ---
  {
    id: 'ai-chat',
    label: 'AI Chat',
    description:
      'AI chatbots and conversational assistants like ChatGPT and Claude for asking questions and chatting.',
  },
  {
    id: 'ai-tools',
    label: 'AI Tools',
    description:
      'AI and machine learning tools, generative image, video and audio platforms, and AI product directories.',
  },
  {
    id: 'ai-research',
    label: 'AI Research',
    description:
      'AI research papers, model benchmarks, evaluations and machine learning research labs.',
  },
  // --- gaming (+ game automation, heavy in this corpus) ---
  {
    id: 'gaming',
    label: 'Gaming',
    description:
      'Video games, game stores, gaming news, esports, gaming communities, and game economies: marketplaces for in-game items, currency, gold and accounts in games like Runescape and World of Warcraft.',
  },
  {
    id: 'game-automation',
    label: 'Game Botting',
    description:
      'Game bots, macros, scripts and automation tools and forums for automating gameplay and farming in-game currency.',
  },
  // --- news / media ---
  {
    id: 'news',
    label: 'News',
    description: 'General news, current events, breaking news and world news coverage.',
  },
  {
    id: 'tech-news',
    label: 'Tech News',
    description:
      'Technology industry news, startup coverage, product launches and tech discussion aggregators like Hacker News.',
  },
  {
    id: 'video',
    label: 'Video',
    description:
      'Video streaming, live streams and user-uploaded video content on platforms like YouTube and Twitch.',
  },
  {
    id: 'movies-tv',
    label: 'Movies & TV',
    description: 'Movies, TV shows, streaming services, film reviews and watchlists.',
  },
  // --- social / community ---
  {
    id: 'social',
    label: 'Social',
    description:
      'Social networking, status updates, photo sharing and social media feeds with friends and followers.',
  },
  {
    id: 'forums',
    label: 'Forums',
    description:
      'Discussion forums, message boards, subreddits and online communities organized by topic.',
  },
  {
    id: 'messaging',
    label: 'Messaging',
    description:
      'Chat apps and messaging platforms for direct messages, group chats and voice or video calls.',
  },
  // --- shopping / finance ---
  {
    id: 'shopping',
    label: 'Shopping',
    description:
      'Online shopping, retail stores, marketplaces and product listings for buying goods.',
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Personal finance, banking, budgeting, investing and stock market information.',
  },
  {
    id: 'crypto',
    label: 'Crypto',
    description:
      'Cryptocurrency exchanges, blockchain explorers, token prices and crypto trading and portfolio tracking.',
  },
  // --- productivity / business ---
  {
    id: 'productivity',
    label: 'Productivity',
    description:
      'Productivity apps, note-taking, documents, spreadsheets, calendars and workflow organization tools.',
  },
  {
    id: 'automation-tools',
    label: 'Automation',
    description:
      'No-code app builders, workflow automation, CRM and marketing automation platforms.',
  },
  // --- design / learning / reference / music ---
  {
    id: 'design',
    label: 'Design',
    description: 'UI/UX design tools, design inspiration, portfolios and creative asset libraries.',
  },
  {
    id: 'learning',
    label: 'Learning',
    description:
      'Online courses, tutorials, flashcards, textbooks and educational learning platforms.',
  },
  {
    id: 'reference-wiki',
    label: 'Reference',
    description:
      'Encyclopedias, wikis, glossaries and reference lookups for facts and definitions.',
  },
  {
    id: 'music',
    label: 'Music',
    description: 'Music streaming, audio production, samples and sound libraries.',
  },
  // --- jobs / lifestyle ---
  {
    id: 'jobs-career',
    label: 'Jobs',
    description:
      'Job listings, freelance marketplaces, resumes and professional career networking.',
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Health information, medical advice, fitness and wellness resources.',
  },
  {
    id: 'travel',
    label: 'Travel',
    description: 'Travel booking, flights, hotels, maps and trip planning.',
  },
  {
    id: 'food',
    label: 'Food',
    description: 'Recipes, restaurants, food delivery and cooking resources.',
  },
  // --- security / privacy (heavy in this corpus via proxy/anonymity tooling) ---
  {
    id: 'security-privacy',
    label: 'Security',
    description:
      'VPNs, proxies, anonymity tools, penetration testing and online privacy and security services.',
  },
  // --- general-purpose long tail ---
  {
    id: 'email',
    label: 'Email',
    description: 'Email inboxes, webmail clients and email service providers.',
  },
  {
    id: 'sports',
    label: 'Sports',
    description: 'Sports news, scores, teams and live sporting event coverage.',
  },
  {
    id: 'real-estate',
    label: 'Real Estate',
    description: 'Real estate listings, home buying, renting and property search.',
  },
  {
    id: 'legal',
    label: 'Legal',
    description: 'Legal information, contracts, law resources and legal services.',
  },
  {
    id: 'government',
    label: 'Government',
    description: 'Government services, official agencies, civic information and public records.',
  },
  {
    id: 'photography',
    label: 'Photography',
    description: 'Photo editing, stock photography and image galleries.',
  },
  {
    id: 'books-reading',
    label: 'Books',
    description: 'Ebooks, digital libraries, book reviews and reading platforms.',
  },
  {
    id: 'podcasts',
    label: 'Podcasts',
    description: 'Podcast platforms, episodes and audio show listings.',
  },
  {
    id: 'events',
    label: 'Events',
    description: 'Event listings, ticketing and event discovery platforms.',
  },
  {
    id: 'home-diy',
    label: 'Home & DIY',
    description: 'Home improvement, DIY projects, renovation and household tips.',
  },
  {
    id: 'automotive',
    label: 'Automotive',
    description:
      'Cars, trucks and motorcycles: vehicle reviews, dealerships, auto parts, repairs and car shopping.',
  },
  {
    id: 'weather',
    label: 'Weather',
    description: 'Weather forecasts, radar maps and current conditions.',
  },
  {
    id: 'file-sharing',
    label: 'File Sharing',
    description: 'File hosting, cloud storage uploads, paste tools and document sharing services.',
  },
];

// Authoritative domain -> tag-ids table (decision 004: heuristics run first, win for known
// hosts). Grounded in the top ~40 domains of a real-world 1,300-bookmark corpus (github.com,
// gaming sites, proxy/VPN vendors, crypto exchanges, ...) plus universal domains
// (chatgpt.com, stackoverflow.com, wikipedia.org, ...) so the table stays useful for anyone.
// Keys are registrable-ish hostnames as they appear after canonicalizeUrl's www-strip; a few
// meaningful subdomains (gist.github.com, docs.google.com, aws.amazon.com, ...) are listed
// explicitly because they mean something different from their parent domain.
export const DOMAIN_TAGS: Readonly<Record<string, readonly string[]>> = {
  // dev
  'github.com': ['dev-repos'],
  'gist.github.com': ['dev-repos', 'dev-tools'],
  'github.io': ['dev-docs'], // GitHub Pages sites (e.g. mejrs.github.io) — project docs/demos.
  'stackoverflow.com': ['dev-help'],
  'stackexchange.com': ['dev-help'],
  'npmjs.com': ['dev-tools'],
  'pypi.org': ['dev-tools'],
  'rapidapi.com': ['dev-tools'],
  'pastebin.com': ['dev-tools', 'file-sharing'],
  'readthedocs.io': ['dev-docs'],
  'developer.mozilla.org': ['dev-docs'],
  'freecodecamp.org': ['learning', 'dev-tools'],
  'v0.dev': ['dev-tools', 'ai-tools'],
  'supabase.com': ['dev-tools', 'cloud-hosting'],
  'pipedream.com': ['automation-tools', 'dev-tools'],
  'zapier.com': ['automation-tools'],
  'bubble.io': ['automation-tools', 'dev-tools'],
  // cloud / hosting
  'digitalocean.com': ['cloud-hosting'],
  'aws.amazon.com': ['cloud-hosting', 'dev-docs'],
  'cloudflare.com': ['cloud-hosting', 'security-privacy'],
  'ovhcloud.com': ['cloud-hosting'],
  'namecheap.com': ['cloud-hosting'],
  'firebase.google.com': ['cloud-hosting', 'dev-tools'],
  'vercel.com': ['cloud-hosting', 'dev-tools'],
  // AI / ML
  'chatgpt.com': ['ai-chat'],
  'chat.openai.com': ['ai-chat'],
  'platform.openai.com': ['ai-tools', 'dev-docs'],
  'claude.ai': ['ai-chat'],
  'grok.com': ['ai-chat'],
  'poe.com': ['ai-chat'],
  'perplexity.ai': ['ai-chat'],
  'huggingface.co': ['ai-tools'],
  'fal.ai': ['ai-tools'],
  'epoch.ai': ['ai-research'],
  'swebench.com': ['ai-research'],
  // gaming / game automation (heavy corpus signal: RuneScape botting ecosystem)
  'dreambot.org': ['game-automation'],
  'osbot.org': ['game-automation'],
  'tribot.org': ['game-automation'],
  'community.tribot.org': ['forums', 'game-automation'],
  'powbot.org': ['game-automation'],
  'alpacabot.org': ['game-automation', 'dev-repos'],
  'rs-hacking.com': ['forums', 'game-automation'],
  'sythe.org': ['forums', 'game-automation'],
  'ownedcore.com': ['forums', 'game-automation'],
  'osrsbox.com': ['gaming', 'reference-wiki'],
  'ge-tracker.com': ['gaming', 'finance'],
  'runescape.wiki': ['gaming', 'reference-wiki'],
  'runescape.com': ['gaming'],
  'eldorado.gg': ['gaming', 'shopping'],
  'steamcommunity.com': ['gaming', 'forums'],
  'steampowered.com': ['gaming', 'shopping'],
  // news / video / movies
  'news.ycombinator.com': ['tech-news', 'forums'],
  'techcrunch.com': ['tech-news'],
  'nytimes.com': ['news'],
  'bbc.com': ['news'],
  'bloomberg.com': ['news', 'finance'],
  'youtube.com': ['video'],
  'twitch.tv': ['video', 'gaming'],
  'letterboxd.com': ['movies-tv'],
  'netflix.com': ['movies-tv'],
  // social / forums / messaging
  'facebook.com': ['social'],
  'x.com': ['social'],
  'twitter.com': ['social'],
  'reddit.com': ['forums'],
  'linkedin.com': ['jobs-career', 'social'],
  'discord.com': ['messaging'],
  'discordservers.com': ['forums'],
  't.me': ['messaging'],
  'cracked.to': ['forums', 'security-privacy'],
  'blackhatworld.com': ['forums', 'security-privacy'],
  'ogusers.com': ['forums', 'security-privacy'],
  // shopping
  'amazon.com': ['shopping'],
  'ebay.com': ['shopping'],
  'newegg.com': ['shopping', 'hardware'],
  'bestbuy.com': ['shopping', 'hardware'],
  'etsy.com': ['shopping'],
  'walmart.com': ['shopping'],
  // finance / crypto
  'coinbase.com': ['crypto'],
  'binance.com': ['crypto'],
  'coinmarketcap.com': ['crypto'],
  'coinglass.com': ['crypto'],
  'blockchain.com': ['crypto'],
  'tradingview.com': ['finance', 'crypto'],
  'investopedia.com': ['finance', 'learning'],
  'koinly.io': ['crypto', 'finance'],
  // productivity
  'docs.google.com': ['productivity'],
  'chromewebstore.google.com': ['browser-extensions'],
  'notion.so': ['productivity'],
  'sharepoint.com': ['productivity'],
  // design
  'figma.com': ['design'],
  'dribbble.com': ['design'],
  'awwwards.com': ['design'],
  'canva.com': ['design'],
  // learning
  'udemy.com': ['learning'],
  'coursera.org': ['learning'],
  'khanacademy.org': ['learning'],
  'quizlet.com': ['learning'],
  'collegeboard.org': ['learning'],
  // reference
  'wikipedia.org': ['reference-wiki'],
  'archive.org': ['reference-wiki'],
  // music
  'spotify.com': ['music'],
  'splice.com': ['music'],
  'audiojungle.net': ['music'],
  // jobs
  'indeed.com': ['jobs-career'],
  'glassdoor.com': ['jobs-career'],
  'upwork.com': ['jobs-career'],
  'fiverr.com': ['jobs-career'],
  // security / privacy (heavy corpus signal: proxy/anonymity vendors used alongside botting)
  'ipqualityscore.com': ['security-privacy'],
  'stormproxies.com': ['security-privacy'],
  'smartproxy.com': ['security-privacy'],
  'oxylabs.io': ['security-privacy'],
  'luminati.io': ['security-privacy'],
  'privateproxy.me': ['security-privacy'],
  'hackthebox.eu': ['security-privacy', 'learning'],
  'generator.email': ['security-privacy', 'email'],
  // automotive / weather / events / misc long tail
  'edmunds.com': ['automotive'],
  'cars.com': ['automotive'],
  'windy.com': ['weather'],
  'eventbrite.com': ['events'],
  'gofile.io': ['file-sharing'],
};

const TAG_IDS: ReadonlySet<string> = new Set(TAXONOMY.map((tag) => tag.id));

const NO_TAGS: readonly string[] = [];

// Public suffix lists (co.uk, github.io, ...) aren't worth a dependency for a domain table this
// small; naive "last two labels" is right for every host actually in DOMAIN_TAGS. It would
// mis-derive multi-part TLDs (e.g. "bbc.co.uk" -> "co.uk") but none are present above — if one is
// ever added, give it an exact entry instead of relying on this fallback.
const REGISTRABLE_LABEL_COUNT = 2;
function registrableDomain(hostname: string): string {
  const labels = hostname.split('.');
  return labels.length <= REGISTRABLE_LABEL_COUNT
    ? hostname
    : labels.slice(-REGISTRABLE_LABEL_COUNT).join('.');
}

function lookupDomainTags(hostname: string): readonly string[] {
  const exact = DOMAIN_TAGS[hostname];
  if (exact) return exact;
  const fallback = DOMAIN_TAGS[registrableDomain(hostname)];
  return fallback ?? NO_TAGS;
}

const GITHUB_HELP_PATH_PATTERN = /\/(issues|pull|discussions)(\/|$)/;

// google.com is the corpus's #3 domain by count but too ambiguous to tag as a whole (it's the
// index of everything): only a few well-known path prefixes carry real signal.
const GOOGLE_PATH_PREFIX_TAGS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/maps', ['travel']],
  ['/travel', ['travel']],
  ['/finance', ['finance']],
];

function mergeUnique(base: readonly string[], extra: readonly string[]): readonly string[] {
  const merged = new Set(base);
  for (const tag of extra) merged.add(tag);
  return [...merged];
}

// A few URL-pattern refinements on top of the domain lookup — kept intentionally small per
// decision 004 ("clean refinements only"), not a general rules engine.
function refineByPath(
  hostname: string,
  pathname: string,
  base: readonly string[],
): readonly string[] {
  if (hostname === 'github.com' && GITHUB_HELP_PATH_PATTERN.test(pathname)) {
    return mergeUnique(base, ['dev-help']);
  }
  if (hostname === 'google.com') {
    const match = GOOGLE_PATH_PREFIX_TAGS.find(([prefix]) => pathname.startsWith(prefix));
    return match ? match[1] : base;
  }
  return base;
}

/**
 * Domain/URL heuristic tags for a bookmark, authoritative for well-known hosts (decision 004).
 * Runs before — and can be overridden by — zero-shot taxonomy matching in tagger.ts. Returns []
 * for hosts with no entry rather than guessing.
 */
export function heuristicTags(canonicalUrl: string): readonly string[] {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return NO_TAGS;
  }
  // canonicalizeUrl (lib/url.ts) already strips "www."; strip defensively so this also behaves
  // for callers/tests that pass a raw, non-canonicalized URL.
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const base = lookupDomainTags(hostname);
  return refineByPath(hostname, url.pathname, base);
}

/** True if every tag id in DOMAIN_TAGS resolves to a real taxonomy entry. Used by tests. */
export function domainTagsAreReferentiallyValid(): boolean {
  return Object.values(DOMAIN_TAGS)
    .flat()
    .every((id) => TAG_IDS.has(id));
}
