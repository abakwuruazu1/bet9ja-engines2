// Capture the real Bet9ja feeds from Node and write the starter JSON used by the
// hosted site. This reuses the engines' own parsing/sync code with a tiny chrome.*
// and IndexedDB shim, so the seed has exactly the same shape as live-captured data.
//
//   node scripts/capture.mjs                 # zoom + tennis + leagueplus
//   node scripts/capture.mjs --only=zoom --deep=80
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createIndexedDB } from './idb-shim.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const ONLY = args.only || 'all';
const DEEP = +(args.deep || 600);
const DETAILS = +(args.details || 500);

function makeChrome() {
  const local = new Map();
  const listeners = new Set();
  const read = key => (typeof key === 'string' ? local.get(key) : undefined);
  const area = {
    async get(keys) {
      const out = {};
      if (keys == null) { for (const [k, v] of local) out[k] = v; return out; }
      if (typeof keys === 'string') { out[keys] = read(keys); return out; }
      if (Array.isArray(keys)) { for (const k of keys) out[k] = read(k); return out; }
      for (const k of Object.keys(keys)) { const v = read(k); out[k] = v === undefined ? keys[k] : v; }
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items || {})) {
        const old = local.get(k);
        local.set(k, v);
        if (JSON.stringify(old) !== JSON.stringify(v)) changes[k] = { oldValue: old, newValue: v };
      }
      if (Object.keys(changes).length) for (const fn of listeners) { try { fn(changes, 'local'); } catch (e) { } }
      return true;
    },
    async remove(keys) { for (const k of [].concat(keys || [])) local.delete(k); return true; },
    async clear() { local.clear(); return true; }
  };
  return {
    storage: {
      local: area,
      session: { async get() { return {}; }, async set() { return true; }, async remove() { return true; }, async clear() { return true; } },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    },
    runtime: {
      getURL: p => p,
      sendMessage: async () => undefined,
      onMessage: { addListener() { } },
      onInstalled: { addListener() { } },
      onStartup: { addListener() { } }
    },
    alarms: { create() { }, get: async () => undefined, clear: async () => true, onAlarm: { addListener() { } } },
    tabs: { query: async () => [], create: async () => ({}), update: async () => ({}), sendMessage: async () => { throw new Error('no tabs'); }, reload() { } },
    action: { onClicked: { addListener() { } } }
  };
}

function fetchWithUA(url, init = {}) {
  const headers = { 'user-agent': UA, 'accept': 'application/json, text/plain, */*', ...(init.headers || {}) };
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(60000) });
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { return null; }
}

const ENGINES = {
  zoom: {
    db: 'zoomStatsDB',
    config: {
      version: 2,
      stores: {
        matches: { keyPath: 'matchId', indexes: { comp: 'comp' } },
        deep: { keyPath: 'matchId' },
        standings: { keyPath: 'key' },
        meta: { keyPath: 'key' },
        live: { keyPath: 'matchId' }
      }
    },
    scripts: ['zoom/lib/settings.js', 'zoom/lib/db.js', 'zoom/lib/api.js', 'zoom/lib/parse.js', 'zoom/lib/sync.js'],
    bootstrap: `globalThis.__capture = runSync({ deepLimit: ${DEEP} }).then(r => r);`
  },
  tennis: {
    db: 'zoomTennisDB',
    config: {
      version: 1,
      stores: {
        matches: { keyPath: 'matchId', indexes: { comp: 'comp' } },
        meta: { keyPath: 'key' },
        live: { keyPath: 'matchId' }
      }
    },
    scripts: ['zoom/lib/settings.js', 'zoom/tennis/lib/tcore.js'],
    bootstrap: `globalThis.__capture = runTennisSync({ detailLimit: ${DETAILS} }).then(r => r);`
  },
  leagueplus: {
    db: 'leaguePlusDB',
    config: {
      version: 1,
      stores: {
        matches: { keyPath: 'key', indexes: { comp: 'comp', ts: 'ts' } },
        meta: { keyPath: 'key' }
      }
    },
    scripts: ['leagueplus/lib/core.js'],
    bootstrap: `globalThis.__capture = lpSync().then(r => r);`
  }
};

async function runEngine(name) {
  const cfg = ENGINES[name];
  const seedPath = `${ROOT}seed/${name}.json`;
  const existing = await readJson(seedPath);
  const idb = createIndexedDB();
  if (existing) idb.seed(cfg.db, cfg.config, existing);

  const context = vm.createContext({
    console,
    fetch: fetchWithUA,
    indexedDB: idb,
    chrome: makeChrome(),
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, AbortSignal,
    structuredClone, performance, crypto,
    EngineNet: { call: (url, init) => fetchWithUA(url, init).then(r => r.json()) }
  });

  const sources = [];
  for (const rel of cfg.scripts) sources.push(await readFile(`${ROOT}${rel}`, 'utf8'));
  const source = sources.join('\n;\n') + '\n;\n' + cfg.bootstrap;
  vm.runInContext(source, context, { filename: name + '-capture.js' });
  const status = await context.__capture;
  const dump = idb.dump(cfg.db);
  const payload = { ...dump, _meta: { at: Date.now(), generatedAt: new Date().toISOString(), engine: name } };
  const counts = Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length]));
  await writeFile(seedPath, JSON.stringify(payload));
  return { name, status, counts, bytes: JSON.stringify(payload).length };
}

const wanted = ONLY === 'all' ? ['zoom', 'tennis', 'leagueplus'] : [ONLY];
for (const name of wanted) {
  const t0 = Date.now();
  console.log(`\n=== capturing ${name} ===`);
  try {
    const result = await runEngine(name);
    console.log(`${name}: ${Math.round((Date.now() - t0) / 1000)}s`, result.counts, `${(result.bytes / 1e6).toFixed(2)} MB`);
    if (result.status && result.status.log && result.status.log.length) console.log('warnings:', result.status.log.slice(0, 5));
  } catch (e) {
    console.error(`${name} failed:`, e);
    process.exitCode = 1;
  }
}
