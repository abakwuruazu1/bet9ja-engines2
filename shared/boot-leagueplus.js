/* Boot for the League Plus dashboard.
   - If the configured Worker is the 24/7 collector, load snapshots from it and poll for
     new rounds. No browser capture is needed; the Worker cron does it.
   - Otherwise keep the original browser capture (relay + 20s checks). */
(() => {
  let busy = false;
  let serverMode = false;

  async function maybeSync(force = false) {
    if (!EngineNet.hasProxy()) return { skipped: 'no-relay' };
    if (busy) return { skipped: 'busy' };
    const { lpstatus } = await chrome.storage.local.get('lpstatus');
    if (!force && lpstatus && lpstatus.lastSync && Date.now() - lpstatus.lastSync < 20000) return { skipped: 'fresh' };
    busy = true;
    try {
      if (navigator.locks && navigator.locks.request) {
        return await navigator.locks.request('lp-capture', { ifAvailable: true }, lock => (lock ? lpSync() : null));
      }
      return await lpSync();
    } finally { busy = false; }
  }

  async function mergeSnapshot(j) {
    let added = 0;
    if (j.init) await LPDB.put('meta', Object.assign({ key: 'init' }, j.init));

    for (const r of j.rounds || []) {
      await LPDB.putMany('matches', r.matches || []);
      const metas = Object.entries(r.selsets || {}).map(([key, value]) => ({ key, value }));
      if (metas.length) await LPDB.putMany('meta', metas);
      added += (r.matches || []).length;
    }
    for (const u of j.upcoming || []) {
      const metas = Object.entries(u.selsets || {}).map(([key, value]) => ({ key, value }));
      if (metas.length) await LPDB.putMany('meta', metas);
      await LPDB.put('meta', { key: 'up:' + u.game, at: u.at, fixtures: u.fixtures });
    }
    for (const s of j.standings || []) {
      await LPDB.put('meta', { key: 'st:' + s.game, at: s.at, standings: s.standings });
    }
    return added;
  }

  async function importServer(initial = false) {
    const cursorRow = await LPDB.get('meta', 'server:cursor');
    let since = initial ? 0 : (cursorRow && cursorRow.ts) || 0;
    let added = 0, generatedAt = Date.now(), lastTs = since;

    for (let page = 0; page < 5; page++) {
      const j = await EngineServer.lpSnapshot({ since, rounds: initial ? 60 : 1000 });
      added += await mergeSnapshot(j);
      generatedAt = j.generatedAt || generatedAt;
      lastTs = j.lastTs || lastTs;
      if (j.lastTs) { since = j.lastTs; await LPDB.put('meta', { key: 'server:cursor', ts: j.lastTs }); }
      if (initial || !j.hasMore || !j.rounds || !j.rounds.length) break;
    }

    if (added || initial) {
      const { lpstatus } = await chrome.storage.local.get('lpstatus');
      const now = Date.now();
      const total = await LPDB.count('matches');
      await chrome.storage.local.set({
        lpstatus: {
          lastSync: generatedAt,
          added,
          lastAdded: added ? now : (lpstatus && lpstatus.lastAdded),
          total,
          log: [],
          server: true,
          firstSync: (lpstatus && lpstatus.firstSync) || generatedAt
        }
      });
    }
    return added;
  }

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg) return;
    if (msg.type === 'lpSyncNow') {
      const job = serverMode ? importServer(false) : maybeSync(true);
      job.then(r => send(r || true)).catch(e => send({ error: e.message }));
      return true;
    }
  });

  window.ENGINE_READY = (async () => {
    const seed = await EngineSeed.load({
      db: LPDB, name: 'leagueplus',
      stores: ['matches', 'meta'],
      url: new URL('../seed/leagueplus.json', location.href).href
    });
    if (seed.loaded) {
      const { lpstatus } = await chrome.storage.local.get('lpstatus');
      if (!lpstatus) {
        await chrome.storage.local.set({
          lpstatus: { lastSync: seed.at || Date.now(), added: 0, total: seed.counts.matches || 0, log: [], firstSync: seed.at || Date.now(), starter: true }
        });
      }
    }

    // The collector and the relay share one Worker URL. Detection is a single GET.
    const detected = await EngineServer.detect(EngineNet.getBase());
    if (detected) {
      try {
        const cursor = await LPDB.get('meta', 'server:cursor');
        await importServer(!cursor);
        serverMode = true;
        setInterval(() => importServer(false).catch(e => console.warn('collector poll failed:', e)), 60000);
        return;
      } catch (e) {
        console.warn('collector snapshot failed, falling back to browser capture:', e);
      }
    }

    setTimeout(() => maybeSync(false).catch(() => { }), 1200);
    setInterval(() => maybeSync(false).catch(() => { }), 15000);
  })();
})();
