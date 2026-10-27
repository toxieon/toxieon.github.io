import { DB_NAME, DB_VERSION, STORE_MULTIPAGE } from './constants.js';
import { openDb } from './idb.js';

export async function putMultipageProject(project) {
  const db = await openDb();
  project.updatedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MULTIPAGE, 'readwrite');
    tx.oncomplete = () => resolve(project);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_MULTIPAGE).put(project);
  });
}

export async function getMultipageProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MULTIPAGE, 'readonly');
    const req = tx.objectStore(STORE_MULTIPAGE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMultipageProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MULTIPAGE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_MULTIPAGE).delete(id);
  });
}

export async function listMultipageProjects(limit = 30) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MULTIPAGE, 'readonly');
    const store = tx.objectStore(STORE_MULTIPAGE);
    const index = store.index('updatedAt');
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
