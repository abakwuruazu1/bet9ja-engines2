/* Boot for the football dashboard (and the shared capture loop).
   Everything the extension's background service worker used to do now runs in this page:
   load starter data, answer dashboard messages, and capture on a timer while the tab is open. */
(() => {
  let busy = false, tennisBusy = false;

  async function withLock(name, fn) {
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request(name, { ifAvailable: true }, lock => (lock ? fn() : null));
    }
    const key = 'engine-lock:' + name;
    try {
      const now = Date.now();
      const cur = +(localStorage.getItem(key) || 0);
      if (cur > now) return null;
      localStorage.setItem(key, now + 15 * 60000);
      try { return await fn(); } finally { localStorage.removeItem(key); }
    } catch (e) { return null; }
  }

  async function maybeZoom(force = false) {
    if (!EngineNet.hasProxy()) return { skipped: 'no-relay' };
    if (busy) return { skipped: 'busy' };
    const st = await getSettings();
    const { status } = await chrome.storage.local.get('status');
    if (!force && status && status.lastSync && Date.now() - status.lastSync < Math.max(60e3, st.syncMin * 60000)) return { skipped: 'fresh' };
    busy = true;
    try {
      return await withLock('zoom-capture', async () => runSync({ deepLimit: force ? Math.max(400, st.deepPerRun) : undefined }));
    } finally { busy = false; }
  }

  async function maybeTennis(force = false) {
    if (!EngineNet.hasProxy()) return { skipped: 'no-relay' };
    if (tennisBusy) return { skipped: 'busy' };
    const st = await getSettings();
    const { tstatus } = await chrome.storage.local.get('tstatus');
    if (!force && tstatus && tstatus.lastSync && Date.now() - tstatus.lastSync < 5 * 60000) return { skipped: 'fresh' };
    tennisBusy = true;
    try {
      return await withLock('tennis-capture', async () => runTennisSync({ detailLimit: force ? Math.max(300, st.tDetailLimit) : st.tDetailLimit }));
    } finally { tennisBusy = false; }
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg) return;
    if (msg.type === 'syncNow') { maybeZoom(true).then(r => send(r || true)).catch(e => send({ error: e.message })); return true; }
    if (msg.type === 'tennisSyncNow') { maybeTennis(true).then(r => send(r || true)).catch(e => send({ error: e.message })); return true; }
    if (msg.type === 'resetAlarm') { send(true); return true; }
    if (msg.type === 'openLiveTab' || msg.type === 'openTennisTab') { send(false); return true; }
    if (msg.type === 'deepOne') {
      getSettings().then(st => ZAPI.matchStats(st.clientId, msg.matchId))
        .then(d => { const rec = ZParse.deep(msg.matchId, d); return ZDB.put('deep', rec).then(() => send({ ok: true, rec })); })
        .catch(e => send({ ok: false, err: e.message }));
      return true;
    }
  });

  window.ENGINE_READY = (async () => {
    const seed = await EngineSeed.load({
      db: ZDB, name: 'zoom',
      stores: ['matches', 'deep', 'standings', 'meta', 'live'],
      url: new URL('../seed/zoom.json', location.href).href
    });
    if (seed.loaded) {
      const { status } = await chrome.storage.local.get('status');
      if (!status) {
        await chrome.storage.local.set({
          status: { lastSync: seed.at || Date.now(), added: 0, total: seed.counts.matches || 0, deepCount: seed.counts.deep || 0, log: [], starter: true }
        });
      }
    }
    setTimeout(() => maybeZoom(false).catch(() => { }), 1200);
    setInterval(() => maybeZoom(false).catch(() => { }), 20000);
    setTimeout(() => maybeTennis(false).catch(() => { }), 8000);
    setInterval(() => maybeTennis(false).catch(() => { }), 60000);
  })();
})();
