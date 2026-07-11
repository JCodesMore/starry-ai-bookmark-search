// Single source of truth for the promo's global timing.
export const FPS = 30;

export const sec = (s: number): number => Math.round(s * FPS);

// Crossfade length between scenes (TransitionSeries overlap).
export const TRANSITION = sec(0.5);

// Net on-screen duration of each scene, in frames.
export const SCENES = {
  hook: sec(5.6),
  intro: sec(3.7),
  demo: sec(14.3),
  privacy: sec(6.0),
  free: sec(4.2),
  cta: sec(7.2),
} as const;

const sceneSum = Object.values(SCENES).reduce((a, b) => a + b, 0);
const transitionCount = Object.keys(SCENES).length - 1;

// TransitionSeries total = sum of sequences minus the overlapped transition frames.
export const TOTAL_FRAMES = sceneSum - transitionCount * TRANSITION;

export const WIDTH = 1920;
export const HEIGHT = 1080;

export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;
