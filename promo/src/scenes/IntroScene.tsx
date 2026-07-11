import React from "react";
import { AbsoluteFill } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { StarMark } from "../starry/StarMark";
import { HEADLINE, SUBLINE } from "../theme";

export const IntroScene: React.FC = () => {
  const mark = usePop(4);
  const word = useRise(14, 30);
  const sub = useRise(38);

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", gap: 36 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={mark}>
          <StarMark size={148} />
        </div>
        <h1 style={{ ...HEADLINE, fontSize: 148, fontWeight: 800, ...word }}>
          Starry
        </h1>
      </div>
      <p style={{ ...SUBLINE, fontSize: 48, ...sub }}>
        Search your bookmarks by meaning.
      </p>
    </AbsoluteFill>
  );
};
