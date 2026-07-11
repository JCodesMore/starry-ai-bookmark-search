// Generate Chrome Web Store listing assets into docs/store/assets/:
//   store-icon-128.png  — 96px artwork centered on a transparent 128px canvas
//                         (CWS wants ~16px padding around the mark)
//   promo-tile-440x280.png — small promo tile: night sky, star mark, wordmark
// The in-package icons (full-bleed) stay as gen-icons.mjs makes them; only the
// store-listing uploads use these.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';

const outDir = resolve(CONFIG.root, 'docs/store/assets');
mkdirSync(outDir, { recursive: true });

// Same mark as gen-icons.mjs, parameterized by canvas so the tile can reuse it.
function markSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d4f96"/>
      <stop offset="1" stop-color="#14305e"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="0.75" y="0.75" width="126.5" height="126.5" rx="27.5" fill="none"
        stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>
  <path d="M58 22 L66.5 51.5 L96 60 L66.5 68.5 L58 98 L49.5 68.5 L20 60 L49.5 51.5 Z"
        fill="#ffffff" opacity="0.97"/>
  <path d="M95 26 L98 36 L108 39 L98 42 L95 52 L92 42 L82 39 L92 36 Z"
        fill="#ffffff" opacity="0.85"/>
</svg>`;
}

// 1) Store icon: 96px mark on a transparent 128px canvas.
const mark96 = await sharp(Buffer.from(markSvg(96)))
  .png()
  .toBuffer();
await sharp({
  create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: mark96, left: 16, top: 16 }])
  .png()
  .toFile(resolve(outDir, 'store-icon-128.png'));

// 2) Promo tile 440x280: full-bleed night sky, mark + wordmark lockup, no clutter.
const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d4f96"/>
      <stop offset="1" stop-color="#101f42"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#sky)"/>
  <circle cx="52" cy="48" r="2" fill="#ffffff" opacity="0.5"/>
  <circle cx="392" cy="66" r="2.6" fill="#ffffff" opacity="0.6"/>
  <circle cx="348" cy="228" r="2" fill="#ffffff" opacity="0.4"/>
  <circle cx="86" cy="216" r="2.4" fill="#ffffff" opacity="0.5"/>
  <circle cx="234" cy="34" r="1.8" fill="#ffffff" opacity="0.45"/>
  <path d="M220 52 L229.5 85.5 L262 95 L229.5 104.5 L220 138 L210.5 104.5 L178 95 L210.5 85.5 Z"
        fill="#ffffff" opacity="0.97"/>
  <path d="M263 46 L266.2 56.8 L277 60 L266.2 63.2 L263 74 L259.8 63.2 L249 60 L259.8 56.8 Z"
        fill="#ffffff" opacity="0.8"/>
  <text x="220" y="212" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="52" font-weight="600" fill="#ffffff">Starry</text>
</svg>`;
await sharp(Buffer.from(tileSvg)).png().toFile(resolve(outDir, 'promo-tile-440x280.png'));

console.log('store assets written: store-icon-128.png, promo-tile-440x280.png');
