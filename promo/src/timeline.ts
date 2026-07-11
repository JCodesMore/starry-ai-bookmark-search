// Single source of truth for the promo's global timing.
export const FPS = 30;

export const sec = (s: number): number => Math.round(s * FPS);

// Per-scene content fade at scene edges (scenes never overlap: the outgoing
// scene fully clears the stage before the next one enters).
export const FADE = 12;

// Duration of each scene, in frames. Scenes play back-to-back (no overlap).
export const SCENES = {
  hook: sec(5.6),
  solution: sec(2.8),
  intro: sec(3.7),
  demo: sec(14.3),
  privacy: sec(6.0),
  free: sec(4.2),
  cta: sec(7.2),
} as const;

export const TOTAL_FRAMES = Object.values(SCENES).reduce((a, b) => a + b, 0);

export const WIDTH = 1920;
export const HEIGHT = 1080;

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;
