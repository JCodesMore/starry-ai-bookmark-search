import React from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useRise, windowOpacity } from "../lib/anim";
import { COLORS, HEADLINE } from "../theme";

// Relatable clutter: the kind of things everyone bookmarks and loses.
const GHOST_TITLES = [
  "How to sear salmon perfectly",
  "CSS grid cheatsheet",
  "Cheap flights to Tokyo",
  "Mortgage payoff calculator",
  "That pasta recipe",
  "Standing desk review",
  "Intro to transformers",
  "Best hiking trails near me",
  "JavaScript event loop, explained",
  "DIY closet organizer",
  "Interview questions to ask",
];

const BEAT_SWAP = 84; // frame where beat A hands off to beat B

// Hand-placed slots (fractions of the frame) so titles never collide with each
// other or with the centered headline; jitter + drift stay within the slot.
const SLOTS: Array<[number, number]> = [
  [0.07, 0.16],
  [0.42, 0.09],
  [0.74, 0.2],
  [0.1, 0.4],
  [0.8, 0.42],
  [0.06, 0.72],
  [0.26, 0.85],
  [0.58, 0.88],
  [0.8, 0.68],
  [0.62, 0.26],
  [0.35, 0.7],
];

const GhostTitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill>
      {GHOST_TITLES.map((title, i) => {
        const [sx, sy] = SLOTS[i % SLOTS.length] ?? [0.5, 0.5];
        const x = (sx + (random(`gx-${i}`) - 0.5) * 0.04) * width;
        const baseY = (sy + (random(`gy-${i}`) - 0.5) * 0.05) * height;
        const speed = 0.12 + random(`gs-${i}`) * 0.2;
        const y = baseY - frame * speed;
        const tilt = (random(`gr-${i}`) - 0.5) * 5;
        return (
          <div
            key={title}
            style={{
              position: "absolute",
              left: x,
              top: y,
              fontSize: 27,
              fontWeight: 500,
              color: COLORS.muted,
              opacity: 0.16,
              transform: `rotate(${tilt}deg)`,
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const line1 = useRise(8);
  const line2 = useRise(30);
  const beatB = useRise(BEAT_SWAP + 10);

  return (
    <AbsoluteFill>
      <GhostTitles />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {/* Beat A: the setup */}
        <div
          style={{
            position: "absolute",
            textAlign: "center",
            opacity: windowOpacity(frame, 0, BEAT_SWAP, 8),
          }}
        >
          <h1 style={{ ...HEADLINE, ...line1 }}>You saved it.</h1>
          <h1
            style={{
              ...HEADLINE,
              color: COLORS.muted,
              marginTop: 14,
              ...line2,
            }}
          >
            Somewhere.
          </h1>
        </div>
        {/* Beat B: the pain */}
        <div
          style={{
            position: "absolute",
            textAlign: "center",
            maxWidth: 1500,
            opacity: windowOpacity(frame, BEAT_SWAP + 6, 9999, 8),
          }}
        >
          <h1 style={{ ...HEADLINE, fontSize: 80, ...beatB }}>
            You just can&apos;t remember
            <br />
            what it was called.
          </h1>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
