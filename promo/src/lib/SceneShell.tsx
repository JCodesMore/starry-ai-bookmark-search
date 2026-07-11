import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FADE } from "../timeline";

type Props = {
  duration: number; // this scene's Sequence length in frames
  holdEnd?: boolean; // last scene: hold the final frame instead of fading out
  children: React.ReactNode;
};

// Clean-stage transition: every scene's content fades in from the bare sky and
// fully fades out before the next scene starts — no cross-scene double exposure.
export const SceneShell: React.FC<Props> = ({
  duration,
  holdEnd = false,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE, duration - FADE, duration],
    [0, 1, 1, holdEnd ? 1 : 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Barely-perceptible push-in (1.2% over the scene) keeps every slide alive.
  const scale = 1 + 0.012 * (frame / duration);
  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};
