// Build the extension: bundle src/ entry points and copy public/ statics into dist/.
//
// public/manifest.json is the STORE truth: crawling lives in
// optional_host_permissions (no install warning; user grants at consent time).
// The native permission prompt can't be accepted over CDP, so the default dev
// build rewrites it to required host_permissions — request() then resolves
// true without a dialog and the e2e suites drive the exact same code paths.
// `--store` skips the rewrite (used by tools/package.mjs).
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';

const storeBuild = process.argv.includes('--store');

const dist = resolve(CONFIG.root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [
    resolve(CONFIG.root, 'src/background.ts'),
    resolve(CONFIG.root, 'src/popup/popup.ts'),
    resolve(CONFIG.root, 'src/offscreen/offscreen.ts'),
    resolve(CONFIG.root, 'src/offscreen/embed-worker.ts'),
    resolve(CONFIG.root, 'src/onboarding/onboarding.ts'),
  ],
  outdir: dist,
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  logLevel: 'warning',
});

cpSync(resolve(CONFIG.root, 'public'), dist, { recursive: true });

if (!storeBuild) {
  const manifestPath = resolve(dist, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = manifest.optional_host_permissions;
  delete manifest.optional_host_permissions;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

// ORT WASM runtime: transformers.js resolves these at runtime relative to
// env.backends.onnx.wasm.wasmPaths (= chrome.runtime.getURL('')).
const ortDist = resolve(CONFIG.root, 'node_modules/onnxruntime-web/dist');
// ORT picks the asyncify build in this environment; ship both pairs to be safe.
for (const file of [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
]) {
  cpSync(resolve(ortDist, file), resolve(dist, file));
}
console.log('built dist/');
