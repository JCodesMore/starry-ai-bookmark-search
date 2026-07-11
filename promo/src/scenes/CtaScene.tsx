import React from "react";
import { AbsoluteFill } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { StarMark } from "../starry/StarMark";
import { COLORS, HEADLINE, SUBLINE } from "../theme";

export const CtaScene: React.FC = () => {
  const mark = usePop(4);
  const word = useRise(12, 30);
  const sub = useRise(26);
  const button = usePop(50, 0.7);
  const footer = useRise(74);

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 34 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <div style={mark}>
          <StarMark size={118} />
        </div>
        <h1 style={{ ...HEADLINE, fontSize: 118, fontWeight: 800, ...word }}>
          Starry
        </h1>
      </div>

      <p style={{ ...SUBLINE, fontSize: 44, ...sub }}>AI Bookmark Search</p>

      <div
        style={{
          marginTop: 26,
          background: COLORS.accent,
          color: "#ffffff",
          fontSize: 42,
          fontWeight: 600,
          padding: "22px 52px",
          borderRadius: 999,
          boxShadow: "0 14px 44px rgba(10, 132, 255, 0.4)",
          ...button,
        }}
      >
        Add to Chrome — free
      </div>

      <p style={{ ...SUBLINE, fontSize: 28, marginTop: 30, ...footer }}>
        Free &amp; open source · github.com/JCodesMore/starry-ai-bookmark-search
      </p>
    </AbsoluteFill>
  );
};
