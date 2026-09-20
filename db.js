const TradeDB = (function () {
  const PREFIX = 'tj_';

  function isAvailable() {
    try {
      const t = '__tj_probe__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }

  const AVAILABLE = isAvailable();

  async function get(key) {
    if (!AVAILABLE) return null;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      console.warn('TradeDB.get failed', e);
      return null;
    }
  }

  async function set(key, value) {
    if (!AVAILABLE) return null;
    try {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    } catch (e) {
      console.warn('TradeDB.set failed', e);
      return null;
    }
  }

  async function del(key) {
    if (!AVAILABLE) return null;
    try {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    } catch (e) {
      console.warn('TradeDB.delete failed', e);
      return null;
    }
  }

  async function list() {
    if (!AVAILABLE) return [];
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  }

  function exportAll() {
    const dump = {};
    if (!AVAILABLE) return dump;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => {
        dump[k.slice(PREFIX.length)] = localStorage.getItem(k);
      });
    return dump;
  }

  function importAll(dump) {
    if (!AVAILABLE || !dump || typeof dump !== 'object') return;
    Object.entries(dump).forEach(([k, v]) => {
      try {
        localStorage.setItem(PREFIX + k, v);
      } catch (e) {
        console.warn('TradeDB.importAll failed for key', k, e);
      }
    });
  }

  function clearAll() {
    if (!AVAILABLE) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  }

  return { get, set, delete: del, list, exportAll, importAll, clearAll, available: AVAILABLE };
})();

/* Хранилище скриншотов: IndexedDB (localStorage слишком мал для картинок) */
const ShotDB = (function () {
  const NAME = 'tj_shots';
  const STORE = 'shots';
  const AVAILABLE = typeof indexedDB !== 'undefined';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!AVAILABLE) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  return {
    getAll: () => run('readonly', (s) => s.getAll()),
    put: (rec) => run('readwrite', (s) => s.put(rec)),
    delete: (id) => run('readwrite', (s) => s.delete(id)),
    clear: () => run('readwrite', (s) => s.clear()),
    available: AVAILABLE,
  };
})();
