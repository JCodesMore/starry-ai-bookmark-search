import React from "react";
import { AbsoluteFill } from "remotion";
import { NightSky } from "./starry/NightSky";
import { StarMark } from "./starry/StarMark";
import { PopupMock } from "./demo/PopupMock";
import { QUERY, RESULTS } from "./demo/demoData";
import { COLORS, FONT, HEADLINE, SUBLINE } from "./theme";

// Custom YouTube/README thumbnail (1280x720): brand + promise + play affordance
// on the left, the finished demo state (bloomed top hit) on the right.
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    <NightSky />

    <div
      style={{
        position: "absolute",
        left: 80,
        top: 0,
        height: "100%",
        width: 620,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 30,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <StarMark size={84} />
        <h1 style={{ ...HEADLINE, fontSize: 88, fontWeight: 800 }}>Starry</h1>
      </div>
      <p
        style={{
          ...SUBLINE,
          fontSize: 38,
          color: COLORS.text,
          fontWeight: 500,
        }}
      >
        Find any bookmark
        <br />
        by describing it.
      </p>
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}
      >
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 34px rgba(0, 0, 0, 0.45)",
          }}
        >
          {/* Play triangle */}
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "17px solid transparent",
              borderBottom: "17px solid transparent",
              borderLeft: `28px solid ${COLORS.popupAccent}`,
              marginLeft: 7,
            }}
          />
        </div>
        <span style={{ ...SUBLINE, fontSize: 30 }}>
          Watch the 40-second tour
        </span>
      </div>
    </div>

    <div
      style={{
        position: "absolute",
        right: 56,
        top: 64,
        transform: "scale(1.12)",
        transformOrigin: "top right",
      }}
    >
      <PopupMock
        typedChars={QUERY.length}
        caretOn={false}
        rowsProgress={RESULTS.map(() => 1)}
        bloom={1}
        focus={1}
      />
    </div>
  </AbsoluteFill>
);
