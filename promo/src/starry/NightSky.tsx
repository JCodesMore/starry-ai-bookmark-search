import React from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";

const STAR_COUNT = 110;
const TWO_PI = Math.PI * 2;

type Star = {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  r: number; // px radius
  baseOpacity: number;
  twinkleAmp: number;
  twinklePhase: number;
  twinkleSpeed: number; // cycles per frame
  driftSpeed: number; // px per frame, upward
};

// Deterministic star field: every property derives from remotion's seeded
// random(), so frames are reproducible and stars never jump between frames.
const makeStars = (): Star[] =>
  Array.from({ length: STAR_COUNT }, (_, i) => ({
    x: random(`sx-${i}`),
    y: random(`sy-${i}`),
    r: 0.8 + random(`sr-${i}`) * 1.6,
    baseOpacity: 0.18 + random(`so-${i}`) * 0.45,
    twinkleAmp: 0.08 + random(`sa-${i}`) * 0.22,
    twinklePhase: random(`sp-${i}`) * TWO_PI,
    twinkleSpeed: 0.004 + random(`sw-${i}`) * 0.012,
    driftSpeed: 0.03 + random(`sd-${i}`) * 0.1,
  }));

const STARS = makeStars();

export const NightSky: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 95% at 50% 6%, ${COLORS.skyGlow} 0%, ${COLORS.skyMid} 44%, ${COLORS.skyDeep} 100%)`,
      }}
    >
      <svg width={width} height={height}>
        {STARS.map((s, i) => {
          const twinkle =
            s.baseOpacity +
            s.twinkleAmp *
              Math.sin(s.twinklePhase + frame * s.twinkleSpeed * TWO_PI);
          const rawY = s.y * height - frame * s.driftSpeed;
          const y = ((rawY % height) + height) % height;
          return (
            <circle
              key={i}
              cx={s.x * width}
              cy={y}
              r={s.r}
              fill="#ffffff"
              opacity={Math.max(0, twinkle)}
            />
          );
        })}
      </svg>
      {/* Soft edge vignette keeps focus center-frame. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(85% 70% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.38) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
