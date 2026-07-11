// Keyboard-model verification: real CDP key events against the live popup page.
import * as cdp from './cdp.mjs';

const SETTLE_MS = 1500;

const ext = await cdp.findExtension();
if (!ext) {
  console.error('Extension not loaded.');
  process.exit(2);
}

const tab = await cdp.createTab(`chrome-extension://${ext.id}/popup.html`);
const c = await cdp.CDP.connect(tab.webSocketDebuggerUrl);

async function key(keyName, code, keyCode, modifiers = 0) {
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyName,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers,
  });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers });
}

async function selectedTitle() {
  const res = await c.send('Runtime.evaluate', {
    expression: `document.querySelector('.row.selected .title')?.textContent ?? null`,
    returnByValue: true,
  });
  return res.result.value;
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  // Type a query through the real input path.
  await c.send('Runtime.evaluate', {
    expression: `(() => { const i = document.querySelector('#query'); i.focus(); i.value = 'runescape botting'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  });
  await cdp.sleep(SETTLE_MS);

  const first = await selectedTitle();
  check('first result pre-selected', typeof first === 'string' && first.length > 0, first);

  await key('ArrowDown', 'ArrowDown', 40);
  await key('ArrowDown', 'ArrowDown', 40);
  const third = await selectedTitle();
  check('ArrowDown x2 moves selection', third !== first && !!third, third);

  await key('ArrowUp', 'ArrowUp', 38);
  const second = await selectedTitle();
  check('ArrowUp moves back', second !== third, second);

  // Ctrl+Enter should open a background tab and keep the popup page alive.
  const before = (await cdp.listTargets()).filter((t) => t.type === 'page').length;
  const CTRL = 2;
  await key('Enter', 'Enter', 13, CTRL);
  await cdp.sleep(800);
  const targetsAfter = (await cdp.listTargets()).filter((t) => t.type === 'page');
  const after = targetsAfter.length;
  check('Ctrl+Enter opens background tab', after === before + 1, `${before} -> ${after}`);

  // Close whatever tab was opened (newest non-popup page).
  const opened = targetsAfter.find(
    (t) => !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'),
  );
  if (opened) await cdp.closeTab(opened.id);

  // Gear opens the settings SCREEN (search surface leaves entirely); Escape
  // returns to search — caught at the document, since the input is hidden.
  await c.send('Runtime.evaluate', { expression: `document.querySelector('#gear').click()` });
  const settingsVisible = (
    await c.send('Runtime.evaluate', {
      expression: `!document.querySelector('#settings-view').hidden && document.querySelector('#search-view').hidden`,
      returnByValue: true,
    })
  ).result.value;
  check('gear opens settings screen, search surface leaves', settingsVisible === true);

  await key('Escape', 'Escape', 27);
  const backToSearch = (
    await c.send('Runtime.evaluate', {
      expression: `document.querySelector('#settings-view').hidden && !document.querySelector('#search-view').hidden`,
      returnByValue: true,
    })
  ).result.value;
  check('Escape returns to search (not popup close)', backToSearch === true);
} finally {
  c.close();
  await cdp.closeTab(tab.id);
}

console.log(checks.every(Boolean) ? '\nALL KEYBOARD CHECKS PASSED' : '\nKEYBOARD CHECKS FAILED');
process.exit(checks.every(Boolean) ? 0 : 1);
