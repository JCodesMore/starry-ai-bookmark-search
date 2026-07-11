import React from "react";
import { COLORS } from "../theme";

// Privacy badge: the classic shield silhouette filled with the brand's
// night-sky gradient, carrying the Starry star (geometry from gen-icons.mjs).
export const ShieldMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="starry-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={COLORS.markTop} />
        <stop offset="1" stopColor={COLORS.markBottom} />
      </linearGradient>
    </defs>
    <path
      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      fill="url(#starry-shield)"
      stroke="rgba(255, 255, 255, 0.4)"
      strokeWidth="0.75"
      strokeLinejoin="round"
    />
    <g transform="translate(5.15, 3.42) scale(0.118)">
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
    </g>
  </svg>
);
