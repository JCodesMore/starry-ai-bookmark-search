import React from "react";
import { AbsoluteFill } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { ShootingStar } from "../starry/ShootingStar";
import { StarMark } from "../starry/StarMark";
import { COLORS, HEADLINE, SUBLINE, WORDMARK_GRADIENT } from "../theme";

export const IntroScene: React.FC = () => {
  const mark = usePop(4);
  const word = useRise(14, 30);
  const sub1 = useRise(36);
  const sub2 = useRise(50);

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", gap: 40 }}
    >
      <ShootingStar
        delay={62}
        from={{ x: 0.76, y: 0.11 }}
        to={{ x: 0.56, y: 0.25 }}
        scale={0.85}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={mark}>
          <StarMark size={148} />
        </div>
        <h1
          style={{
            ...HEADLINE,
            fontSize: 148,
            fontWeight: 800,
            ...WORDMARK_GRADIENT,
            ...word,
          }}
        >
          Starry
        </h1>
      </div>
      {/* The store / GitHub tagline, verbatim (docs/store/listing.md summary). */}
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <p
          style={{
            ...SUBLINE,
            fontSize: 46,
            color: COLORS.text,
            fontWeight: 500,
            ...sub1,
          }}
        >
          Find your bookmarks like a simple Google search.
        </p>
        <p style={{ ...SUBLINE, fontSize: 40, ...sub2 }}>
          Local, private, and free. It just works.
        </p>
      </div>
    </AbsoluteFill>
  );
};
