import type React from "react";
import { loadFont } from "@remotion/google-fonts/Inter";

// Inter ~= the extension's system-ui look, and renders identically on every machine.
const inter = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const FONT = `${inter.fontFamily}, system-ui, sans-serif`;

// Brand colors. Popup values mirror public/tokens.css (light theme); the mark
// gradient mirrors tools/gen-icons.mjs — the single source of truth for the logo.
export const COLORS = {
  // Night sky (video backdrop — a deeper cut of the icon's night-blue)
  skyGlow: "#1c3568",
  skyMid: "#0e1d3f",
  skyDeep: "#050b18",
  // Icon mark
  markTop: "#2d4f96",
  markBottom: "#14305e",
  // Text on the dark backdrop (tokens.css dark theme)
  text: "#f5f5f7",
  muted: "#98989d",
  accent: "#0a84ff",
  // Popup mock surface (tokens.css light theme)
  popupBg: "#ffffff",
  popupText: "#1d1d1f",
  popupMuted: "#6e6e73",
  popupHairline: "rgba(0, 0, 0, 0.08)",
  popupSelection: "rgba(0, 0, 0, 0.045)",
  popupAccent: "#0071e3",
  chipBg: "rgba(0, 0, 0, 0.05)",
} as const;

export const HEADLINE: React.CSSProperties = {
  fontFamily: FONT,
  fontWeight: 700,
  fontSize: 92,
  lineHeight: 1.15,
  color: COLORS.text,
  letterSpacing: "-0.02em",
  margin: 0,
};

export const SUBLINE: React.CSSProperties = {
  fontFamily: FONT,
  fontWeight: 400,
  fontSize: 42,
  lineHeight: 1.35,
  color: COLORS.muted,
  letterSpacing: "-0.01em",
  margin: 0,
};
