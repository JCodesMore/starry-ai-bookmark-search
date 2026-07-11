import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { usePop, useRise } from "../lib/anim";
import { StarMark } from "../starry/StarMark";
import { COLORS, HEADLINE, SUBLINE } from "../theme";

const RING_PERIOD = 75;
const RING_COUNT = 2;

// Expanding halo rings around the device — "everything happens right here".
const PulseRings: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: RING_COUNT }, (_, i) => {
        const t =
          ((frame + (i * RING_PERIOD) / RING_COUNT) % RING_PERIOD) /
          RING_PERIOD;
        const size = 300 + t * 320;
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
  const device = usePop(20, 0.8);
  const line1 = useRise(48);
  const line2 = useRise(82);

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", gap: 54 }}
    >
      <h1 style={{ ...HEADLINE, ...headline }}>Private by design.</h1>

      <div
        style={{
          position: "relative",
          width: 340,
          height: 230,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...device,
        }}
      >
        <PulseRings />
        {/* Your computer */}
        <div
          style={{
            width: 340,
            height: 230,
            borderRadius: 24,
            border: "3px solid rgba(255, 255, 255, 0.28)",
            background: "rgba(255, 255, 255, 0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <StarMark size={96} />
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
          The AI runs entirely on your computer.
        </p>
        <p style={{ ...SUBLINE, fontSize: 46, ...line2 }}>
          Your bookmarks never leave your machine.
        </p>
      </div>
    </AbsoluteFill>
  );
};
