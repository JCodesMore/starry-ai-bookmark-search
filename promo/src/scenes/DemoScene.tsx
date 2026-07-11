import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { caretVisible, windowOpacity } from "../lib/anim";
import { PopupMock, typedCharsAt } from "../demo/PopupMock";
import { RESULTS, TYPING_FRAMES } from "../demo/demoData";
import { HEADLINE, SUBLINE } from "../theme";

// Local phase map (frames within this scene).
const FOCUS_AT = 10;
const TYPE_START = 28;
const RESULTS_START = 155;
const RESULT_STAGGER = 5;
const BLOOM_START = 245;
const POPUP_SCALE = 1.9;

type Caption = { from: number; until: number; title: string; sub: string };

const CAPTIONS: Caption[] = [
  {
    from: 8,
    until: 160,
    title: "Search for what you want.",
    sub: "Keywords or a phrase — no need to be precise.",
  },
  {
    from: 160,
    until: 243,
    title: "Starry matches meaning.",
    sub: "Loose, everyday words find the right result.",
  },
  {
    from: 243,
    until: 9999,
    title: "Topics learned automatically.",
    sub: "Your library organizes itself — no manual tagging.",
  },
];

export const DemoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 90 },
  });
  const focus = interpolate(frame, [FOCUS_AT, FOCUS_AT + 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const typedChars = typedCharsAt(frame, TYPE_START);
  const typingActive =
    frame >= TYPE_START && frame <= TYPE_START + TYPING_FRAMES;
  const rowsProgress = RESULTS.map((_, i) =>
    spring({
      frame,
      fps,
      delay: RESULTS_START + i * RESULT_STAGGER,
      config: { damping: 18, stiffness: 150, mass: 0.7 },
    }),
  );
  const bloom = spring({
    frame,
    fps,
    delay: BLOOM_START,
    config: { damping: 12, stiffness: 110, mass: 0.9 },
  });
  const float = Math.sin(frame * 0.035) * 3;

  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center" }}>
      {/* Captions, left column */}
      <div style={{ width: "44%", height: "100%", position: "relative" }}>
        {CAPTIONS.map((c) => (
          <div
            key={c.title}
            style={{
              position: "absolute",
              top: "50%",
              left: 130,
              maxWidth: 640,
              opacity: windowOpacity(frame, c.from, c.until, 9),
              transform: "translateY(-50%)",
            }}
          >
            <h2 style={{ ...HEADLINE, fontSize: 66 }}>{c.title}</h2>
            <p style={{ ...SUBLINE, fontSize: 38, marginTop: 22 }}>{c.sub}</p>
          </div>
        ))}
      </div>

      {/* The popup, right column — real logical size, scaled up */}
      <div
        style={{
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 60 + float}px) scale(${POPUP_SCALE})`,
          transformOrigin: "center left",
          marginLeft: 60,
        }}
      >
        <PopupMock
          typedChars={typedChars}
          caretOn={typingActive ? true : caretVisible(frame)}
          rowsProgress={rowsProgress}
          bloom={bloom}
          focus={focus}
        />
      </div>
    </AbsoluteFill>
  );
};
