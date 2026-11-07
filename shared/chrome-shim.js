/* Web runtime: a small stand-in for the chrome.* extension APIs used by the engines.
   Storage lives in IndexedDB (so the ~100 MB of captured history is not limited by
   localStorage's 5 MB quota), messages are routed in-page, and alarms are timers. */
(() => {
  if (window.__engineChromeShim) return;
  window.__engineChromeShim = true;

  const DB_NAME = 'engineChromeStorage';
  const STORE = 'kv';
  let dbp = null;

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }

  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function rawGet(key) {
    const db = await openDb();
    return reqP(db.transaction(STORE).objectStore(STORE).get(key));
  }
  async function rawSet(key, value) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(value, key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  async function rawDelete(key) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  async function rawKeys() {
    const db = await openDb();
    return reqP(db.transaction(STORE).objectStore(STORE).getAllKeys());
  }

  // ---------- storage areas
  const sessionMem = new Map();
  const changeListeners = { local: new Set(), session: new Set() };

  function fire(area, changes) {
    if (!Object.keys(changes).length) return;
    for (const fn of changeListeners[area]) {
      try { fn(changes, area); } catch (e) { console.warn('storage listener failed', e); }
    }
  }

  function makeArea(area) {
    const keyOf = k => area + ':' + k;
    async function readKey(k) {
      if (area === 'session') return sessionMem.get(k);
      return rawGet(keyOf(k));
    }
    return {
      async get(keys) {
        const out = {};
        if (keys == null) {
          if (area === 'session') {
            for (const [k, v] of sessionMem) out[k] = v;
          } else {
            const all = await rawKeys();
            for (const full of all) {
              if (!String(full).startsWith(area + ':')) continue;
              out[String(full).slice(area.length + 1)] = await rawGet(full);
            }
          }
          return out;
        }
        if (typeof keys === 'string') { out[keys] = await readKey(keys); return out; }
        if (Array.isArray(keys)) { for (const k of keys) out[k] = await readKey(k); return out; }
        if (typeof keys === 'object') {
          for (const k of Object.keys(keys)) { const v = await readKey(k); out[k] = v === undefined ? keys[k] : v; }
          return out;
        }
        return out;
      },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items || {})) {
          const old = await readKey(k);
          if (area === 'session') sessionMem.set(k, v); else await rawSet(keyOf(k), v);
          if (JSON.stringify(old) !== JSON.stringify(v)) changes[k] = { oldValue: old, newValue: v };
        }
        fire(area, changes);
        return true;
      },
      async remove(keys) {
        const list = typeof keys === 'string' ? [keys] : (keys || []);
        const changes = {};
        for (const k of list) {
          const old = await readKey(k);
          if (area === 'session') sessionMem.delete(k); else await rawDelete(keyOf(k));
          if (old !== undefined) changes[k] = { oldValue: old };
        }
        fire(area, changes);
        return true;
      },
      async clear() {
        const old = await this.get(null);
        if (area === 'session') sessionMem.clear();
        else {
          const all = await rawKeys();
          for (const full of all) if (String(full).startsWith(area + ':')) await rawDelete(full);
        }
        const changes = {};
        for (const k of Object.keys(old)) changes[k] = { oldValue: old[k] };
        fire(area, changes);
        return true;
      }
    };
  }

  // ---------- alarms
  const alarmListeners = new Set();
  const alarms = new Map();

  function clearAlarm(name) {
    const a = alarms.get(name);
    if (!a) return false;
    clearTimeout(a.timeout);
    clearInterval(a.interval);
    alarms.delete(name);
    return true;
  }

  // ---------- messages
  const messageListeners = new Set();

  function sendMessage(msg) {
    return new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled = true; resolve(value); } };
      let async = false;
      for (const fn of messageListeners) {
        try {
          const r = fn(msg, { id: 'web-page', url: location.href }, done);
          if (r === true) async = true;
        } catch (e) { console.warn('message handler failed', e); }
      }
      if (!async) setTimeout(() => done(undefined), 0);
      // never leave a caller hanging if a handler forgets to answer
      setTimeout(() => done(undefined), 15 * 60 * 1000);
    });
  }

  const noopEvent = { addListener() {}, removeListener() {}, hasListener() { return false; } };

  const shim = {
    storage: {
      local: makeArea('local'),
      session: makeArea('session'),
      sync: makeArea('local'),
      onChanged: {
        addListener: fn => { changeListeners.local.add(fn); changeListeners.session.add(fn); },
        removeListener: fn => { changeListeners.local.delete(fn); changeListeners.session.delete(fn); }
      }
    },
    runtime: {
      id: 'engine-web',
      getURL: p => new URL(p, location.href).href,
      sendMessage,
      onMessage: { addListener: fn => messageListeners.add(fn), removeListener: fn => messageListeners.delete(fn) },
      onInstalled: noopEvent,
      onStartup: noopEvent,
      lastError: undefined
    },
    alarms: {
      create(name, info = {}) {
        clearAlarm(name);
        const delay = Math.max(0, (info.delayInMinutes ?? 0) * 60000);
        const period = Math.max(0, (info.periodInMinutes ?? 0) * 60000);
        const fireAlarm = () => { for (const fn of alarmListeners) { try { fn({ name }); } catch (e) { console.warn(e); } } };
        const a = { name, periodInMinutes: info.periodInMinutes, timeout: null, interval: null };
        a.timeout = setTimeout(() => {
          fireAlarm();
          if (period) a.interval = setInterval(fireAlarm, period);
        }, delay);
        alarms.set(name, a);
      },
      get(name) {
        const a = alarms.get(name);
        return Promise.resolve(a ? { name, periodInMinutes: a.periodInMinutes } : undefined);
      },
      clear(name) { return Promise.resolve(clearAlarm(name)); },
      onAlarm: { addListener: fn => alarmListeners.add(fn), removeListener: fn => alarmListeners.delete(fn) }
    },
    tabs: {
      async query() { return []; },
      async create(opts) {
        const url = typeof opts === 'string' ? opts : opts && opts.url;
        if (url) window.open(url, '_blank', 'noopener');
        return { id: 0, url };
      },
      async update() { return {}; },
      async sendMessage() { throw new Error('No relay tab is available in the web version'); },
      reload() {}
    },
    action: { onClicked: noopEvent }
  };

  // Chrome already exposes a `chrome` object in normal pages; extend it.
  window.chrome = Object.assign(window.chrome || {}, shim);
})();
