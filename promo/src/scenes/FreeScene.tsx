import React from "react";
import { AbsoluteFill } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { COLORS, HEADLINE, SUBLINE } from "../theme";

const CHIPS = ["No account", "No subscription", "No limits"];
const CHIP_STAGGER = 8;

export const FreeScene: React.FC = () => {
  const headline = useRise(6);
  const sub = useRise(58);
  const chipPops = [
    usePop(28),
    usePop(28 + CHIP_STAGGER),
    usePop(28 + CHIP_STAGGER * 2),
  ];

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 56 }}
    >
      <h1 style={{ ...HEADLINE, ...headline }}>Free. Nothing to upsell.</h1>

      <div style={{ display: "flex", gap: 26 }}>
        {CHIPS.map((chip, i) => (
          <div
            key={chip}
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: COLORS.text,
              padding: "16px 34px",
              borderRadius: 999,
              border: "1.5px solid rgba(255, 255, 255, 0.22)",
              background: "rgba(255, 255, 255, 0.06)",
              ...chipPops[i],
            }}
          >
            {chip}
          </div>
        ))}
      </div>

      <p
        style={{
          ...SUBLINE,
          fontSize: 40,
          maxWidth: 1250,
          textAlign: "center",
          ...sub,
        }}
      >
        There&apos;s no server behind Starry — so there&apos;s nothing to charge
        for.
      </p>
    </AbsoluteFill>
  );
};
