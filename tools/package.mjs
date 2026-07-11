// Produce the Chrome Web Store upload: a store-manifest build of dist/,
// sanity-checked and zipped with manifest.json at the ZIP ROOT (CWS rejects
// nested-folder zips). Finishes by restoring the normal dev build so the
// dev browser's loaded dist/ keeps its required host permissions.
// Usage: npm run package
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from './config.mjs';

const dist = resolve(CONFIG.root, 'dist');
const releaseDir = resolve(CONFIG.root, 'release');
const node = process.execPath;

function fail(msg) {
  console.error(`PACKAGE FAILED: ${msg}`);
  process.exit(1);
}

console.log('building store variant…');
execFileSync(node, [resolve(CONFIG.root, 'tools/build.mjs'), '--store'], { stdio: 'inherit' });

// --- sanity checks on the exact bytes that would ship ---
const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
if (manifest.host_permissions) fail('store manifest must not carry required host_permissions');
if (!manifest.optional_host_permissions?.includes('<all_urls>'))
  fail('optional_host_permissions missing');
if (manifest.permissions.includes('storage')) fail('unused storage permission crept back in');
for (const file of [
  'background.js',
  'popup.html',
  'popup.js',
  'onboarding.html',
  'onboarding.js',
  'offscreen.js',
  'embed-worker.js',
  'icons/icon128.png',
  'ort-wasm-simd-threaded.asyncify.wasm', // bundled WASM = the remote-code rule
]) {
  if (!existsSync(resolve(dist, file))) fail(`dist missing ${file}`);
}

const version = manifest.version;
mkdirSync(releaseDir, { recursive: true });
const zip = resolve(releaseDir, `starry-v${version}.zip`);
rmSync(zip, { force: true });

// Zip the CONTENTS of dist (manifest at root), not the dist folder itself.
// Windows: Compress-Archive. Elsewhere (incl. the release CI runner): zip(1).
if (process.platform === 'win32') {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path "${dist}\\*" -DestinationPath "${zip}"`,
  ]);
} else {
  execFileSync('zip', ['-qr', zip, '.'], { cwd: dist });
}

const mb = (statSync(zip).size / (1024 * 1024)).toFixed(1);
console.log(`packaged: ${zip} (${mb} MB, v${version})`);

console.log('restoring dev build…');
execFileSync(node, [resolve(CONFIG.root, 'tools/build.mjs')], { stdio: 'inherit' });
console.log('done — dist/ is the dev build again; upload the zip from release/.');
