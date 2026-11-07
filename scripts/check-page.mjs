// Headless Chrome probe: opens a page, collects console/exception messages and
// prints what actually rendered. Used to verify the site locally.
//   node scripts/check-page.mjs <url> [waitMs] [outPng]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const waitMs = +(process.argv[3] || 12000);
const outPng = process.argv[4];
const chromePath = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean).find(existsSync);
if (!chromePath) throw new Error('Chrome/Edge not found; set CHROME_PATH');
const port = 9333 + Math.floor(Math.random() * 200);
const userDir = join(tmpdir(), 'engine-check-' + Date.now());

const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + port, '--user-data-dir=' + userDir,
  '--window-size=' + (process.env.WINDOW || '1440,1000'), url
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); if (r.ok) return; } catch (e) { }
    await delay(150);
  }
  throw new Error('Chrome did not start');
}

await waitPort();
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page') || list[0];
if (!page) throw new Error('No page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push('EXCEPTION: ' + (d.exception && (d.exception.description || d.exception.value) || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    logs.push(m.params.type.toUpperCase() + ': ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    logs.push('LOG: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  }
};
function send(method, params = {}) {
  return new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await delay(waitMs);

const tab = process.argv[5];
if (tab) {
  await send('Runtime.evaluate', { expression: `document.querySelector('#tabs [data-tab="${tab}"]')?.click()` });
  await delay(2500);
}

const clickSelector = process.argv[6];
if (clickSelector) {
  await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(clickSelector)})?.click()` });
  await delay(+(process.argv[7] || 6000));
}

const extraJs = process.argv[8];
if (extraJs) {
  await send('Runtime.evaluate', { expression: extraJs });
  await delay(4000);
}

const evalRes = await send('Runtime.evaluate', {
  expression: `(() => ({
    title: document.title,
    sync: (document.querySelector('#syncLine') || {}).innerText || null,
    relay: (document.querySelector('#relayMsg') || {}).innerText || null,
    saved: (document.querySelector('#setMsg') || {}).innerText || null,
    modalOpen: !!document.querySelector('#relayModal:not(.hidden)'),
    relayUrl: localStorage.getItem('engineProxyUrl'),
    tabs: [...document.querySelectorAll('#tabs button')].map(b => b.innerText),
    viewText: (document.querySelector('#view') || document.body).innerText.slice(0, 700),
    cards: document.querySelectorAll('.card').length,
    rows: document.querySelectorAll('#view tr').length,
    bodyLen: document.body.innerText.length
  }))()`,
  returnByValue: true
});
console.log(JSON.stringify({ url, result: evalRes.result && evalRes.result.result && evalRes.result.result.value, logs }, null, 2));

if (outPng) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (shot.result && shot.result.data) writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
}

ws.close();
chrome.kill();
process.exit(0);
