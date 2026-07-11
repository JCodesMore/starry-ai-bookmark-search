import React from "react";
import { interpolate } from "remotion";
import { COLORS, FONT } from "../theme";
import { BLOOM, QUERY, RESULTS, charRevealFrames } from "./demoData";
import { CopyIcon, ExternalLinkIcon, FolderIcon, GearIcon } from "./icons";
import { StarMark } from "../starry/StarMark";

// The popup rendered at its real logical size (380px wide, like popup.css);
// callers scale it up with a CSS transform so proportions stay authentic.
export type PopupMockProps = {
  typedChars: number;
  caretOn: boolean;
  rowsProgress: number[]; // 0..1 entrance progress per result row
  bloom: number; // 0..1 (springy, may overshoot) top-hit detail expansion
  focus: number; // 0..1 search-field focus highlight
};

export const POPUP_WIDTH = 380;

// Logical height of a collapsed result row; entrance animates 0 -> ROW_HEIGHT
// so the card grows with the cascade instead of reserving empty space.
const ROW_HEIGHT = 50;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const Title: React.FC<{ segments: (typeof RESULTS)[number]["title"] }> = ({
  segments,
}) => (
  <div
    style={{
      fontSize: 13.5,
      lineHeight: 1.35,
      color: COLORS.popupText,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {segments.map((seg, i) => (
      <span key={i} style={{ fontWeight: seg.match ? 700 : 500 }}>
        {seg.text}
      </span>
    ))}
  </div>
);

const SubLine: React.FC<{ domain: string; snippet: string }> = ({
  domain,
  snippet,
}) => (
  <div
    style={{
      fontSize: 11.5,
      lineHeight: 1.4,
      color: COLORS.popupMuted,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}
  >
    {domain}
    <span style={{ margin: "0 6px" }}> </span>
    {snippet}
  </div>
);

const Favicon: React.FC<{ monogram: string; bg: string }> = ({
  monogram,
  bg,
}) => (
  <div
    style={{
      width: 20,
      height: 20,
      borderRadius: 5,
      background: bg,
      color: "#ffffff",
      fontSize: 11,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    }}
  >
    {monogram}
  </div>
);

const BloomDetails: React.FC<{ bloom: number }> = ({ bloom }) => {
  const reveal = clamp01(bloom);
  const contentOpacity = interpolate(reveal, [0.35, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        maxHeight: reveal * 120,
        overflow: "hidden",
        opacity: contentOpacity,
      }}
    >
      <div style={{ fontSize: 11.5, color: COLORS.popupMuted, marginTop: 8 }}>
        {BLOOM.url}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: COLORS.popupMuted,
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <FolderIcon size={12} color={COLORS.popupMuted} />
        {BLOOM.folder}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}
      >
        <span
          style={{
            fontSize: 11,
            color: COLORS.popupMuted,
            marginRight: 2,
            whiteSpace: "nowrap",
          }}
        >
          {BLOOM.added}
        </span>
        {BLOOM.chips.map((chip) => (
          <span
            key={chip}
            style={{
              fontSize: 10.5,
              color: COLORS.popupMuted,
              background: COLORS.chipBg,
              borderRadius: 6,
              padding: "3px 8px",
              whiteSpace: "nowrap",
            }}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
};

export const PopupMock: React.FC<PopupMockProps> = ({
  typedChars,
  caretOn,
  rowsProgress,
  bloom,
  focus,
}) => {
  const typed = QUERY.slice(0, typedChars);
  const bloomReveal = clamp01(bloom);

  return (
    <div
      style={{
        width: POPUP_WIDTH,
        background: COLORS.popupBg,
        borderRadius: 18,
        padding: 12,
        fontFamily: FONT,
        boxShadow:
          "0 24px 70px rgba(0, 0, 0, 0.45), 0 4px 16px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* Header: mark + wordmark + settings, like the real popup */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "2px 4px 10px",
        }}
      >
        <StarMark size={22} />
        <div
          style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.popupText }}
        >
          Starry
        </div>
        <div style={{ flexGrow: 1 }} />
        <GearIcon size={15} color={COLORS.popupMuted} />
      </div>

      {/* Search field */}
      <div
        style={{
          height: 40,
          borderRadius: 10,
          border: `1.5px solid`,
          borderColor: focus > 0.5 ? COLORS.popupAccent : COLORS.popupHairline,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
        }}
      >
        <span
          style={{ fontSize: 15, color: COLORS.popupText, whiteSpace: "pre" }}
        >
          {typed}
        </span>
        <div
          style={{
            width: 1.5,
            height: 18,
            marginLeft: 1,
            background: COLORS.popupText,
            opacity: caretOn ? 1 : 0,
          }}
        />
        {typedChars === 0 ? (
          <span style={{ fontSize: 15, color: COLORS.popupMuted }}>
            Search your bookmarks
          </span>
        ) : null}
      </div>

      {/* Ranked results */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {RESULTS.map((row, i) => {
          const progress = clamp01(rowsProgress[i] ?? 0);
          const isTop = i === 0;
          const lift = isTop ? bloomReveal : 0;
          const settled = progress > 0.999;
          return (
            <div
              key={row.domain}
              style={{
                height: settled ? "auto" : progress * ROW_HEIGHT,
                overflow: settled ? "visible" : "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: `${8 + lift * 4}px ${10 + lift * 2}px`,
                  borderRadius: 8 + lift * 6,
                  background: isTop
                    ? `rgba(255, 255, 255, ${lift})`
                    : undefined,
                  boxShadow:
                    isTop && lift > 0.01
                      ? `0 ${8 * lift}px ${20 * lift}px rgba(0, 0, 0, ${0.13 * lift}), 0 2px 5px rgba(0, 0, 0, ${0.06 * lift})`
                      : undefined,
                  opacity: progress,
                  transform: `translateY(${(1 - progress) * 12}px) scale(${isTop ? 1 + (bloom - bloomReveal) * 0.02 + lift * 0.01 : 1})`,
                }}
              >
                <Favicon monogram={row.monogram} bg={row.monogramBg} />
                <div style={{ minWidth: 0, flexGrow: 1 }}>
                  <Title segments={row.title} />
                  <SubLine domain={row.domain} snippet={row.snippet} />
                  {isTop ? <BloomDetails bloom={bloom} /> : null}
                </div>
                {isTop ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      opacity: bloomReveal,
                      marginTop: 2,
                    }}
                  >
                    <ExternalLinkIcon size={13} color={COLORS.popupMuted} />
                    <CopyIcon size={13} color={COLORS.popupMuted} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// How many characters of the query are visible at a given local frame.
export const typedCharsAt = (frame: number, typeStart: number): number =>
  charRevealFrames.filter((t) => t <= frame - typeStart).length;
