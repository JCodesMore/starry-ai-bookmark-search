import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type Rise = {
  opacity: number;
  transform: string;
};

// Springy fade-up entrance, the video's default motion verb. Opacity lands
// well before the motion settles, so elements never linger half-visible.
export const useRise = (delay: number, distance = 44): Rise => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame,
    fps,
    delay,
    config: { damping: 200, stiffness: 120, mass: 0.9 },
  });
  return {
    opacity: interpolate(progress, [0, 0.6], [0, 1], {
      extrapolateRight: "clamp",
    }),
    transform: `translateY(${(1 - progress) * distance}px)`,
  };
};

// Springy pop-in (scale) for marks, chips and buttons.
export const usePop = (delay: number, from = 0.6): Rise => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({
    frame,
    fps,
    delay,
    config: { damping: 14, stiffness: 130, mass: 0.8 },
  });
  return {
    opacity: interpolate(progress, [0, 0.35], [0, 1], {
      extrapolateRight: "clamp",
    }),
    transform: `scale(${from + (1 - from) * progress})`,
  };
};

// Crossfade helper: fully visible inside [start, end], fading over `fade` frames.
export const windowOpacity = (
  frame: number,
  start: number,
  end: number,
  fade = 10,
): number =>
  interpolate(frame, [start, start + fade, end - fade, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

// Square-wave caret blink (period in frames).
export const caretVisible = (frame: number, period = 32): boolean =>
  frame % period < period / 2;
