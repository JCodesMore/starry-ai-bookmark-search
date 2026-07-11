// Generate extension icons (16/32/48/128) from a single SVG mark.
// Design: night-sky blue rounded square, white four-point star (Starry) with a
// small companion star — clean, no clutter, legible at 16px.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';

const SIZES = [16, 32, 48, 128];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d4f96"/>
      <stop offset="1" stop-color="#14305e"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <path d="M58 22 L66.5 51.5 L96 60 L66.5 68.5 L58 98 L49.5 68.5 L20 60 L49.5 51.5 Z"
        fill="#ffffff" opacity="0.97"/>
  <path d="M95 26 L98 36 L108 39 L98 42 L95 52 L92 42 L82 39 L92 36 Z"
        fill="#ffffff" opacity="0.85"/>
</svg>`;

const outDir = resolve(CONFIG.root, 'public/icons');
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, `icon${size}.png`));
}
console.log(`icons written: ${SIZES.map((s) => `icon${s}.png`).join(', ')}`);
