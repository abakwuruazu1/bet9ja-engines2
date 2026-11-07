/* Loads the bundled starter database into IndexedDB the first time a browser visits.
   The engines then append anything captured while the page is open. */
const EngineSeed = (() => {
  async function load({ db, name, stores, url }) {
    const marker = 'seed:' + name;
    try {
      const existing = await db.get('meta', marker);
      if (existing) return { loaded: false, reason: 'already-loaded' };
      // Do not overwrite a database the user has already captured into.
      const init = await db.get('meta', 'init');
      if (init) { await db.put('meta', { key: marker, at: Date.now(), skipped: true }); return { loaded: false, reason: 'existing-data' }; }

      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return { loaded: false, reason: 'no-seed' };
      const data = await res.json();
      for (const store of stores) {
        const rows = data[store];
        if (Array.isArray(rows) && rows.length) await db.putMany(store, rows);
      }
      await db.put('meta', { key: marker, at: Date.now(), source: url, stores });
      return { loaded: true, counts: Object.fromEntries(stores.map(s => [s, (data[s] || []).length])), at: (data._meta && data._meta.at) || null };
    } catch (e) {
      console.warn('Starter data could not be loaded:', e);
      return { loaded: false, reason: e.message };
    }
  }
  return { load };
})();
