// Launch (or attach to) the dedicated dev browser instance and ensure the
// unpacked extension is loaded. Idempotent — safe to run any time.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { CONFIG } from './config.mjs';
import { isUp, sleep, browserVersion, enableDevMode, findExtension, loadUnpacked } from './cdp.mjs';

async function ensureExtension() {
  await enableDevMode();
  let ext = await findExtension();
  if (!ext) {
    console.log('Extension not loaded via --load-extension; trying CDP Extensions.loadUnpacked…');
    try {
      await loadUnpacked(CONFIG.extensionDir);
    } catch (e) {
      console.error(`Extensions.loadUnpacked failed: ${e.message}`);
    }
    ext = await findExtension();
  }
  if (!ext) throw new Error('Could not load the unpacked extension by any method.');
  return ext;
}

let status = 'already-running';
if (!(await isUp())) {
  status = 'launched';
  mkdirSync(CONFIG.profileDir, { recursive: true });
  const args = [
    `--user-data-dir=${CONFIG.profileDir}`,
    `--remote-debugging-port=${CONFIG.port}`,
    '--enable-unsafe-extension-debugging',
    `--load-extension=${CONFIG.extensionDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-crash-restore-bubble',
  ];
  spawn(CONFIG.cometExe, args, { detached: true, stdio: 'ignore' }).unref();

  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(500);
    up = await isUp();
  }
  if (!up) throw new Error(`Browser did not open CDP port ${CONFIG.port} within 30s`);
}

const ext = await ensureExtension();
console.log(
  JSON.stringify(
    {
      status,
      browser: (await browserVersion()).Browser,
      cdp: `http://127.0.0.1:${CONFIG.port}`,
      extension: { id: ext.id, name: ext.name, version: ext.version, state: ext.state },
    },
    null,
    2,
  ),
);
