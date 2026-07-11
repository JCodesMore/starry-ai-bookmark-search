import React from "react";
import { COLORS } from "../theme";

type Props = {
  size: number;
  // Rounded night-blue tile behind the star (the extension icon). Without it,
  // just the white star — for use on the sky itself.
  tile?: boolean;
};

// Geometry copied from tools/gen-icons.mjs — the single source of truth for the mark.
export const StarMark: React.FC<Props> = ({ size, tile = true }) => (
  <svg width={size} height={size} viewBox="0 0 128 128">
    {tile ? (
      <>
        <defs>
          <linearGradient id="starry-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={COLORS.markTop} />
            <stop offset="1" stopColor={COLORS.markBottom} />
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="28" fill="url(#starry-tile)" />
      </>
    ) : null}
    <path
      d="M58 22 L66.5 51.5 L96 60 L66.5 68.5 L58 98 L49.5 68.5 L20 60 L49.5 51.5 Z"
      fill="#ffffff"
      opacity="0.97"
    />
    <path
      d="M95 26 L98 36 L108 39 L98 42 L95 52 L92 42 L82 39 L92 36 Z"
      fill="#ffffff"
      opacity="0.85"
    />
  </svg>
);
