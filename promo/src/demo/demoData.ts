import { random } from "remotion";

// The demo query: loose, conversational, shares almost no words with the top
// hit's exact title — the product's core promise, demonstrated honestly.
export const QUERY = "that visual tool for building ai agents";

// Natural typing rhythm: per-character cumulative reveal frames, deterministic
// via remotion's seeded random(). Spaces get an extra beat, like real typing.
const CHAR_BASE = 2.1;
const CHAR_JITTER = 2.6;
const SPACE_PAUSE = 1.6;

export const charRevealFrames: number[] = (() => {
  let t = 0;
  return QUERY.split("").map((ch, i) => {
    t +=
      CHAR_BASE +
      random(`char-${i}`) * CHAR_JITTER +
      (ch === " " ? SPACE_PAUSE : 0);
    return Math.round(t);
  });
})();

export const TYPING_FRAMES = charRevealFrames[charRevealFrames.length - 1] ?? 0;

export type TitleSegment = {
  text: string;
  match: boolean; // rendered bold, like the real popup's matched-word emphasis
};

export type ResultRow = {
  monogram: string;
  monogramBg: string;
  title: TitleSegment[];
  domain: string;
  snippet: string;
};

// Same corpus as the real store screenshots (docs/store/assets/shot-1) — no
// invented bookmarks. Flowise ranks first: "Build AI Agents, Visually" is the
// meaning-match for "that visual tool for building ai agents".
export const RESULTS: ResultRow[] = [
  {
    monogram: "F",
    monogramBg: "#111827",
    title: [
      { text: "Flowise - Build ", match: false },
      { text: "AI Agents", match: true },
      { text: ", ", match: false },
      { text: "Visually", match: true },
    ],
    domain: "flowiseai.com",
    snippet: "Open source generative AI development platform",
  },
  {
    monogram: "b",
    monogramBg: "#0f172a",
    title: [
      { text: "Botpress | The Complete ", match: false },
      { text: "AI Agent", match: true },
      { text: " Platform", match: false },
    ],
    domain: "botpress.com",
    snippet: "Enterprise-grade AI agent platform for support",
  },
  {
    monogram: "R",
    monogramBg: "#6d5ae6",
    title: [
      { text: "Relevance AI | ", match: false },
      { text: "AI Agents", match: true },
      { text: " for Sales & Marketing", match: false },
    ],
    domain: "relevanceai.com",
    snippet: "Deliver maximum ROI with an AI workforce",
  },
  {
    monogram: "c",
    monogramBg: "#b91c1c",
    title: [
      { text: "crewAI - Platform for Multi ", match: false },
      { text: "AI Agents", match: true },
    ],
    domain: "crewai.com",
    snippet: "The Leading Multi-Agent Platform",
  },
  {
    monogram: "O",
    monogramBg: "#64748b",
    title: [
      { text: "Orgo - Computers for ", match: false },
      { text: "AI Agents", match: true },
    ],
    domain: "orgo.ai",
    snippet: "Instant cloud computers your AI agents can use",
  },
];

// Detail card ("bloom") content for the top hit — mirrors the real expanded
// card: full URL, folder path, added date, learned topic chips.
export const BLOOM = {
  url: "https://flowiseai.com/",
  folder: "Bookmarks bar / Dev / AI Tools",
  added: "Added Jul 2026",
  chips: ["AI Research", "agents"],
} as const;
