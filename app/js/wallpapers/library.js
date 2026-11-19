// On-device wallpaper library (IndexedDB). Collections hold images; each image is stored once per
// collection, keyed by a hash of the original file so re-importing the same picture is skipped.

const DB_NAME = "encore-wallpapers";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("collections", { keyPath: "id" });
        const images = db.createObjectStore("images", { keyPath: "key" });
        images.createIndex("byCollection", "collectionId");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

const done = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
async function store(name, mode = "readonly") {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}
const finished = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

export const imageKey = (collectionId, hash) => `${collectionId}:${hash}`;

export async function listCollections() {
  const all = await done((await store("collections")).getAll());
  return all.sort((a, b) => b.updated - a.updated);
}
export async function getCollection(id) {
  if (!id) return null;
  return (await done((await store("collections")).get(id))) || null;
}
export async function createCollection(name) {
  const c = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
    name: name || "Untitled collection", created: Date.now(), updated: Date.now(), count: 0, covers: [] };
  await done((await store("collections", "readwrite")).put(c));
  return c;
}
export async function saveCollection(c) {
  c.updated = Date.now();
  await done((await store("collections", "readwrite")).put(c));
  return c;
}
export async function deleteCollection(id) {
  const db = await open();
  const t = db.transaction(["collections", "images"], "readwrite");
  t.objectStore("collections").delete(id);
  const idx = t.objectStore("images").index("byCollection");
  const keys = await done(idx.getAllKeys(IDBKeyRange.only(id)));
  keys.forEach(k => t.objectStore("images").delete(k));
  await finished(t);
}

export async function hasImage(collectionId, hash) {
  const k = await done((await store("images")).getKey(imageKey(collectionId, hash)));
  return k !== undefined;
}
export async function addImage(collectionId, rec) {
  const db = await open();
  const t = db.transaction(["collections", "images"], "readwrite");
  const key = imageKey(collectionId, rec.hash);
  t.objectStore("images").put({ ...rec, key, collectionId, added: Date.now() });
  const c = await done(t.objectStore("collections").get(collectionId));
  if (c) {
    c.count = (c.count || 0) + 1;
    c.covers = [key, ...(c.covers || [])].slice(0, 4);
    c.updated = Date.now();
    t.objectStore("collections").put(c);
  }
  await finished(t);
  return key;
}
export async function removeImage(key) {
  const db = await open();
  const t = db.transaction(["collections", "images"], "readwrite");
  const img = await done(t.objectStore("images").get(key));
  if (!img) return;
  t.objectStore("images").delete(key);
  const c = await done(t.objectStore("collections").get(img.collectionId));
  if (c) {
    c.count = Math.max(0, (c.count || 1) - 1);
    c.covers = (c.covers || []).filter(k => k !== key);
    c.updated = Date.now();
    t.objectStore("collections").put(c);
  }
  await finished(t);
}

/** Keys of the photos in rotation (hidden ones left out), in the order they were added. */
export async function imageKeys(collectionId) {
  const all = await done((await store("images")).index("byCollection").getAll(IDBKeyRange.only(collectionId)));
  return all.filter(r => !r.hidden).sort((a, b) => a.added - b.added).map(r => r.key);
}

/** Hide a photo from rotation, or bring it back. It is never deleted. */
export async function setHidden(key, hidden) {
  const db = await open();
  const t = db.transaction("images", "readwrite");
  const rec = await done(t.objectStore("images").get(key));
  if (rec) { rec.hidden = !!hidden; t.objectStore("images").put(rec); }
  await finished(t);
}
/** Full records (Blobs are references; their bytes load only when used). */
export async function images(collectionId) {
  const all = await done((await store("images")).index("byCollection").getAll(IDBKeyRange.only(collectionId)));
  return all.sort((a, b) => a.added - b.added);
}
export async function getImage(key) {
  return (await done((await store("images")).get(key))) || null;
}

/** Ask the browser not to clear this storage when space runs low. */
export async function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
export async function usage() {
  try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}
