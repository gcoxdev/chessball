import assert from 'node:assert/strict';

// Run against a built preview and a dedicated Chromium debugging session.
const cdp = process.env.CHESSBALL_CDP_HTTP ?? 'http://127.0.0.1:9224';
const url = process.env.CHESSBALL_PREVIEW_URL ?? 'http://127.0.0.1:4177/';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retry(action, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await action();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

const targets = await retry(async () => {
  try {
    const response = await fetch(`${cdp}/json`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    const targets = await response.json();
    // Chrome can accept requests before its initial page target exists.
    return targets.some(target => target.type === 'page' && target.webSocketDebuggerUrl) ? targets : null;
  } catch { return null; }
}, 'Chromium debugging endpoint');
await retry(async () => {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; }
  catch { return false; }
}, 'production preview');
const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
assert.ok(page?.webSocketDebuggerUrl, 'Chromium must have an open page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
const errors = [];
const pending = new Map();
let nextId = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  clearTimeout(entry.timer);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Chromium socket timed out')), 10_000);
  socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chromium connection failed')); }, { once: true });
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method} ${params.expression ?? ''}`)); }, 30_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
const wait = expression => retry(() => evaluate(expression), expression);
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  assert.ok(await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (node.disabled || node.closest('[inert]')) return false;
    node.click(); return true;
  })()`), `Control unavailable: ${selector}`);
}
async function button(text) {
  await retry(() => evaluate(`(() => {
    const node = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(text)} && !node.disabled && !node.closest('[inert]'));
    if (!node) return false;
    node.click(); return true;
  })()`), `button ${text}`);
}

const results = [];
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'about:blank' });
    await wait("location.href === 'about:blank'");
    await send('Page.navigate', { url });
    await wait("document.querySelector('#game-workspace')?.textContent === 'Chessball'");
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Page overflow at ${width}`);

    await click('[aria-label="Open menu"]');
    await button('Rules');
    await wait('Boolean(document.querySelector(".rules-content"))');
    assert.equal(await evaluate('document.querySelector(".rules-reference").open'), false, 'Full rules start collapsed');
    await click('.rules-reference summary');
    assert.equal(await evaluate('document.querySelector(".rules-reference").open'), true, 'Full rules expand');
    await evaluate("document.querySelector('.rules-content').scrollTop = 10000");
    assert.ok(await evaluate(`(() => {
      const r = document.querySelector('[aria-label="Close rules"]').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
    })()`), `Rules close control clipped at ${width}`);
    await click('[aria-label="Close rules"]');
    await button('Settings');
    for (const appearance of ['Helmets', 'Circles', 'Football players']) {
      await click(`input[aria-label="${appearance}"]`);
      assert.ok(await evaluate(`document.querySelector('input[aria-label="${appearance}"]').checked`));
    }
    await button('Larger squares');
    await button('Fit field');
    await click('[aria-label="Close settings"]');
    await click('[aria-label="Away Human"]');
    await click('[aria-label="Close menu"]');
    await button('Start Game');
    await button('Flip Coin');
    await button('Receive');
    await button('Kickoff');
    await wait('Boolean(document.querySelector(".kick-target"))');
    const boardBeforeRefresh = await evaluate("[...document.querySelectorAll('[role=gridcell]')].map(cell => cell.getAttribute('aria-label'))");
    const diceBeforeRefresh = await evaluate("document.querySelector('[aria-label=\"Last dice roll\"]').textContent");
    await send('Page.reload');
    await wait('Boolean(document.querySelector(".resume-panel"))');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `Resume panel overflow at ${width}`);
    await button('Start New Game');
    await button('Cancel');
    await button('Resume Game');
    await wait('Boolean(document.querySelector(".kick-target"))');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[role=gridcell]')].map(cell => cell.getAttribute('aria-label'))"), boardBeforeRefresh, 'Board restored exactly');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Last dice roll\"]').textContent"), diceBeforeRefresh, 'Original dice restored');
    assert.equal(await evaluate("document.querySelectorAll('.command-panel button').length"), 0, 'Placement uses field targets only');
    await click('.kick-target');
    await wait("document.querySelector('[role=\"status\"]')?.textContent.includes('Return.') || document.querySelector('[role=\"status\"]')?.textContent.includes('Between Downs.')");
    await click('[aria-label="Open menu"]');
    await button('New Game');
    await button('Cancel');
    assert.ok(await evaluate(`Boolean(document.querySelector('[aria-label="Close menu"]'))`));
    await button('New Game');
    await button('Confirm');
    await wait('!document.querySelector("[role=dialog]")');
    await wait("document.querySelector('[role=\"status\"]')?.textContent.includes('Pregame.')");
    assert.ok(await evaluate("document.activeElement?.id === 'game-workspace'"), 'Reset focus');
    results.push({ width, height, menu: true, rules: true, settings: true, kickoff: true, resume: true, commands: true, reset: true });
  }
  assert.deepEqual(errors, [], 'Browser errors');
  console.log(JSON.stringify({ result: 'pass', url, results }, null, 2));
} finally {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  socket.close();
}
