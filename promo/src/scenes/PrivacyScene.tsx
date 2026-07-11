import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { ShieldMark } from "../starry/ShieldMark";
import { COLORS, HEADLINE, SUBLINE } from "../theme";

const RING_PERIOD = 75;
const RING_COUNT = 2;

// Expanding halo rings around the shield — "everything stays right here".
const PulseRings: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: RING_COUNT }, (_, i) => {
        const t =
          ((frame + (i * RING_PERIOD) / RING_COUNT) % RING_PERIOD) /
          RING_PERIOD;
        const size = 280 + t * 300;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              border: `2px solid ${COLORS.accent}`,
              opacity: (1 - t) * 0.35,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </>
  );
};

export const PrivacyScene: React.FC = () => {
  const headline = useRise(6);
  const shield = usePop(18, 0.75);
  const line1 = useRise(44);
  const line2 = useRise(68);

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 48 }}
    >
      <h1 style={{ ...HEADLINE, ...headline }}>Private by design.</h1>

      <div
        style={{
          position: "relative",
          width: 250,
          height: 250,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...shield,
        }}
      >
        <PulseRings />
        <div
          style={{
            filter: "drop-shadow(0 14px 40px rgba(10, 132, 255, 0.35))",
          }}
        >
          <ShieldMark size={230} />
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <p
          style={{
            ...SUBLINE,
            fontSize: 46,
            color: COLORS.text,
            fontWeight: 500,
            ...line1,
          }}
        >
          Everything runs locally.
        </p>
        <p style={{ ...SUBLINE, fontSize: 46, ...line2 }}>
          Your bookmarks never leave your machine.
        </p>
      </div>
    </AbsoluteFill>
  );
};
