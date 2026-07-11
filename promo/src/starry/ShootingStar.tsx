import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

type Props = {
  delay: number; // local frame the streak begins
  durationInFrames?: number;
  from: { x: number; y: number }; // fractions of the frame
  to: { x: number; y: number };
  scale?: number;
};

// A single deterministic meteor: bright head, tapering tail, sine envelope
// (fades in, peaks mid-flight, fades out — never pops on or off).
export const ShootingStar: React.FC<Props> = ({
  delay,
  durationInFrames = 24,
  from,
  to,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const progress = (frame - delay) / durationInFrames;
  if (progress <= 0 || progress >= 1) {
    return null;
  }
  const x = (from.x + (to.x - from.x) * progress) * width;
  const y = (from.y + (to.y - from.y) * progress) * height;
  const angle = Math.atan2((to.y - from.y) * height, (to.x - from.x) * width);
  const envelope = Math.sin(progress * Math.PI);
  const tail = 220 * scale * envelope;

  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: envelope }}>
      {/* Tail trails opposite to the direction of travel */}
      <div
        style={{
          position: "absolute",
          width: tail,
          height: 2.5 * scale,
          top: -1.25 * scale,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0))",
          transform: `rotate(${angle + Math.PI}rad)`,
          transformOrigin: "left center",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 5 * scale,
          height: 5 * scale,
          marginLeft: -2.5 * scale,
          marginTop: -2.5 * scale,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: `0 0 ${14 * scale}px ${4 * scale}px rgba(255, 255, 255, 0.55)`,
        }}
      />
    </div>
  );
};
