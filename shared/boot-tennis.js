/* Boot for the tennis dashboard. */
(() => {
  let busy = false;

  async function withLock(name, fn) {
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request(name, { ifAvailable: true }, lock => (lock ? fn() : null));
    }
    try { return await fn(); } catch (e) { return null; }
  }

  async function maybeSync(force = false) {
    if (!EngineNet.hasProxy()) return { skipped: 'no-relay' };
    if (busy) return { skipped: 'busy' };
    const st = await getSettings();
    const { tstatus } = await chrome.storage.local.get('tstatus');
    if (!force && tstatus && tstatus.lastSync && Date.now() - tstatus.lastSync < 5 * 60000) return { skipped: 'fresh' };
    busy = true;
    try {
      return await withLock('tennis-capture', async () => runTennisSync({ detailLimit: force ? Math.max(300, st.tDetailLimit) : st.tDetailLimit }));
    } finally { busy = false; }
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg) return;
    if (msg.type === 'tennisSyncNow') { maybeSync(true).then(r => send(r || true)).catch(e => send({ error: e.message })); return true; }
    if (msg.type === 'openTennisTab') { send(false); return true; }
    if (msg.type === 'resetAlarm') { send(true); return true; }
  });

  window.ENGINE_READY = (async () => {
    const seed = await EngineSeed.load({
      db: TDB, name: 'tennis',
      stores: ['matches', 'meta', 'live'],
      url: new URL('../seed/tennis.json', location.href).href
    });
    if (seed.loaded) {
      const { tstatus } = await chrome.storage.local.get('tstatus');
      if (!tstatus) {
        await chrome.storage.local.set({
          tstatus: { lastSync: seed.at || Date.now(), added: 0, detailed: 0, total: seed.counts.matches || 0, withDetails: seed.counts.matches || 0, log: [], starter: true }
        });
      }
    }
    setTimeout(() => maybeSync(false).catch(() => { }), 1200);
    setInterval(() => maybeSync(false).catch(() => { }), 30000);
  })();
})();
