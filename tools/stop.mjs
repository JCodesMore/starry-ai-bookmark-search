// Cleanly shut down the dev browser instance (never touches the main browser —
// only whatever is listening on the dev CDP port).
import { browser, isUp, sleep } from './cdp.mjs';

if (!(await isUp())) {
  console.log('Dev browser not running.');
  process.exit(0);
}

const b = await browser();
await Promise.race([b.send('Browser.close'), sleep(2000)]);
b.close();
// Give the WebSocket handle a beat to tear down, then exit naturally —
// process.exit() mid-close trips a libuv assertion on Windows.
await sleep(300);
console.log('Dev browser closed.');
