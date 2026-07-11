import React from "react";
import { AbsoluteFill } from "remotion";
import { useRise } from "../lib/anim";
import { COLORS, HEADLINE } from "../theme";

// The bridge between the problem and the reveal: sets up the Starry slide.
export const SolutionScene: React.FC = () => {
  const line = useRise(10);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <h1 style={{ ...HEADLINE, fontSize: 84, textAlign: "center", ...line }}>
        What if you could just{" "}
        <span style={{ color: COLORS.accent }}>describe it</span>?
      </h1>
    </AbsoluteFill>
  );
};
