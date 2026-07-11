import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { GitHubIcon } from "../demo/icons";
import { ShootingStar } from "../starry/ShootingStar";
import { StarMark } from "../starry/StarMark";
import { COLORS, HEADLINE, SUBLINE, WORDMARK_GRADIENT } from "../theme";

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = usePop(4);
  const word = useRise(12, 30);
  const sub = useRise(26);
  const button = usePop(50, 0.7);
  const footer = useRise(74);
  // Gentle breathing glow keeps the button alive through the long hold.
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.055);

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 34 }}
    >
      <ShootingStar
        delay={96}
        from={{ x: 0.7, y: 0.07 }}
        to={{ x: 0.44, y: 0.2 }}
      />
      <ShootingStar
        delay={156}
        durationInFrames={28}
        from={{ x: 0.3, y: 0.1 }}
        to={{ x: 0.15, y: 0.23 }}
        scale={0.55}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <div style={mark}>
          <StarMark size={118} />
        </div>
        <h1
          style={{
            ...HEADLINE,
            fontSize: 118,
            fontWeight: 800,
            ...WORDMARK_GRADIENT,
            ...word,
          }}
        >
          Starry
        </h1>
      </div>

      <p
        style={{
          ...SUBLINE,
          fontSize: 46,
          color: "rgba(245, 245, 247, 0.85)",
          ...sub,
        }}
      >
        The AI Bookmark Search
      </p>

      <div
        style={{
          marginTop: 26,
          background: COLORS.accent,
          color: "#ffffff",
          fontSize: 42,
          fontWeight: 600,
          padding: "22px 52px",
          borderRadius: 999,
          boxShadow: `0 14px ${44 + pulse * 12}px rgba(10, 132, 255, ${0.32 + pulse * 0.18})`,
          ...button,
        }}
      >
        Add to Chrome — free
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 30,
          ...footer,
        }}
      >
        <GitHubIcon size={26} color={COLORS.muted} />
        <span style={{ ...SUBLINE, fontSize: 28 }}>
          github.com/JCodesMore/starry-ai-bookmark-search
        </span>
      </div>
    </AbsoluteFill>
  );
};
