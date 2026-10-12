import { DB_NAME, DB_VERSION, STORE_CAPTURES } from './constants.js';

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
          const store = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

export async function putCapture(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_CAPTURES).put(record);
  });
}

export async function getCapture(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readonly');
    const req = tx.objectStore(STORE_CAPTURES).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listCaptures(limit = 50) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readonly');
    const store = tx.objectStore(STORE_CAPTURES);
    const index = store.index('createdAt');
    const results = [];
    const req = index.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }
      results.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCapture(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAPTURES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_CAPTURES).delete(id);
  });
}

export async function trimHistory(maxItems = 40) {
  const all = await listCaptures(maxItems + 20);
  if (all.length <= maxItems) return;
  const toRemove = all.slice(maxItems);
  for (const item of toRemove) {
    await deleteCapture(item.id);
  }
}
