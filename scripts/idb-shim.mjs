// A small in-memory IndexedDB implementation: enough of the API for db.js, core.js and
// tcore.js to run under Node while generating the starter dataset.
export function createIndexedDB() {
  const dbs = new Map();

  class Request {
    constructor() { this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null; }
    _ok(value) { this.result = value; setTimeout(() => { try { this.onsuccess && this.onsuccess({ target: this }); } catch (e) { console.error(e); } }, 0); }
    _fail(error) { this.error = error; setTimeout(() => { try { this.onerror && this.onerror({ target: this }); } catch (e) { console.error(e); } }, 0); }
  }

  class IndexView {
    constructor(store, tx, index) { this.store = store; this.tx = tx; this.index = index; }
    getAll(value) {
      const out = [...this.store.records.values()].filter(r => r && r[this.index.keyPath] === value);
      return this.one(out);
    }
    getAllKeys(value) { return this.one([...this.store.records.values()].filter(r => r[this.index.keyPath] === value).map(r => r[this.store.keyPath])); }
    one(value) { this.tx._schedule(); const r = new Request(); r._ok(value); return r; }
  }

  class StoreView {
    constructor(store, tx) { this.store = store; this.tx = tx; }
    get(keyPath) {
      let key = keyPath;
      if (keyPath && typeof keyPath === 'object' && keyPath.index) return this.index(keyPath.index).get(keyPath.value);
      this.tx._schedule();
      const r = new Request();
      r._ok(this.store.records.get(key));
      return r;
    }
    getAll() { this.tx._schedule(); const r = new Request(); r._ok([...this.store.records.values()].map(v => structuredClone(v))); return r; }
    getAllKeys() { this.tx._schedule(); const r = new Request(); r._ok([...this.store.records.keys()]); return r; }
    count() { this.tx._schedule(); const r = new Request(); r._ok(this.store.records.size); return r; }
    put(item) {
      const key = item[this.store.keyPath];
      if (key === undefined) throw new Error('Key path ' + this.store.keyPath + ' not found');
      this.store.records.set(key, structuredClone(item));
      this.tx._schedule();
      const r = new Request(); r._ok(key); return r;
    }
    delete(key) { this.store.records.delete(key); this.tx._schedule(); const r = new Request(); r._ok(undefined); return r; }
    clear() { this.store.records.clear(); this.tx._schedule(); const r = new Request(); r._ok(undefined); return r; }
    index(name) { const idx = this.store.indexes.get(name); if (!idx) throw new Error('No index ' + name); return new IndexView(this.store, this.tx, idx); }
  }

  class Transaction {
    constructor(db, names) { this.db = db; this.names = names; this.oncomplete = null; this.onerror = null; this._timer = null; this._done = false; }
    objectStore(name) {
      if (!this.names.includes(name)) throw new Error('Store not in transaction: ' + name);
      return new StoreView(this.db.stores.get(name), this);
    }
    _schedule() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        if (this._done) return;
        this._done = true;
        try { this.oncomplete && this.oncomplete(); } catch (e) { console.error(e); }
      }, 5);
    }
  }

  class ObjectStoreNames {
    constructor(db) { this.db = db; }
    contains(name) { return this.db.stores.has(name); }
    get length() { return this.db.stores.size; }
    *[Symbol.iterator]() { yield* this.db.stores.keys(); }
  }

  class Database {
    constructor(name, version) { this.name = name; this.version = version; this.stores = new Map(); this.objectStoreNames = new ObjectStoreNames(this); }
    createObjectStore(name, opts = {}) {
      if (!this.stores.has(name)) this.stores.set(name, { name, keyPath: opts.keyPath || 'id', records: new Map(), indexes: new Map() });
      const store = this.stores.get(name);
      store.createIndex = (iname, keyPath) => { store.indexes.set(iname, { name: iname, keyPath }); };
      return store;
    }
    transaction(names) {
      const list = Array.isArray(names) ? names : [names];
      return new Transaction(this, list);
    }
    close() {}
  }

  return {
    dbs,
    open(name, version = 1) {
      const req = new Request();
      setTimeout(() => {
        let db = dbs.get(name);
        const isNew = !db || version > db.version;
        if (isNew) {
          db = new Database(name, version);
          dbs.set(name, db);
          req.result = db;
          try { req.onupgradeneeded && req.onupgradeneeded({ target: req }); } catch (e) { console.error('upgrade failed', e); req._fail(e); return; }
        }
        req.result = db;
        req._ok(db);
      }, 0);
      return req;
    },
    ensure(name, version, config) {
      let db = dbs.get(name);
      if (!db) { db = new Database(name, version); dbs.set(name, db); }
      for (const [storeName, cfg] of Object.entries(config)) {
        const store = db.createObjectStore(storeName, { keyPath: cfg.keyPath });
        for (const [idxName, keyPath] of Object.entries(cfg.indexes || {})) store.createIndex(idxName, keyPath);
      }
      return db;
    },
    seed(name, config, data) {
      const db = this.ensure(name, config.version || 1, config.stores);
      for (const [storeName, rows] of Object.entries(data || {})) {
        const store = db.stores.get(storeName);
        if (!store || !Array.isArray(rows)) continue;
        for (const row of rows) store.records.set(row[store.keyPath], structuredClone(row));
      }
      return db;
    },
    dump(name) {
      const db = dbs.get(name);
      if (!db) return {};
      const out = {};
      for (const [storeName, store] of db.stores) out[storeName] = [...store.records.values()].map(v => structuredClone(v));
      return out;
    }
  };
}
