// Lyrics from LRCLIB (https://lrclib.net), a free, community-contributed lyrics database.
// ⚠ Not licensed by music publishers, and Spotify's Developer Policy III.5 may consider this "content from another
//   service integrated with streams". Off by default; see docs/SECURITY.md for the accepted risk.
//
// What is sent: only the song title, main artist, album name and length. No account, token or Spotify data.
// Results are cached on this device (IndexedDB, max 200 songs) so a song is looked up only once.

const API = "https://lrclib.net/api/get";
const CLIENT = "Encore (https://github.com/Joshua416ms/encore)";   // LRCLIB asks apps to identify themselves
const DB_NAME = "encore-lyrics", STORE = "lyrics", MAX_CACHED = 200, MAX_CHARS = 20000;

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("bySaved", "saved");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function cacheGet(id) {
  try { return (await req((await db()).transaction(STORE).objectStore(STORE).get(id))) || null; } catch { return null; }
}
async function cachePut(id, data) {
  try {
    const store = (await db()).transaction(STORE, "readwrite").objectStore(STORE);
    store.put({ id, data, saved: Date.now() });
    const count = await req(store.count());
    if (count > MAX_CACHED) {                                   // remove the oldest entries
      const old = await req(store.index("bySaved").getAllKeys(null, count - MAX_CACHED));
      old.forEach(k => store.delete(k));
    }
  } catch { /* cache is optional */ }
}

/** Parses LRC text ("[01:23.45] line") into [{ t: ms, text }], sorted by time. */
export function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc).split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) lines.push({ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/**
 * Returns { status: "synced" | "plain" | "none", lines?, plain? } for a normalized track from playback.js.
 * "none" covers: not found, instrumental, podcast episode, network trouble, or rate limiting.
 */
export async function getLyrics(track) {
  if (!track || track.kind !== "track" || !track.title || !track.artist) return { status: "none" };
  const cached = await cacheGet(track.id);
  if (cached) return cached.data;

  const url = new URL(API);
  url.searchParams.set("track_name", track.title);
  url.searchParams.set("artist_name", track.artist);
  if (track.albumName) url.searchParams.set("album_name", track.albumName);
  if (track.duration) url.searchParams.set("duration", String(Math.round(track.duration / 1000)));

  let r;
  try { r = await fetch(url, { headers: { "Lrclib-Client": CLIENT }, credentials: "omit", referrerPolicy: "no-referrer" }); }
  catch { return { status: "none" }; }                         // offline: try again next time (not cached)
  if (r.status === 404) { const d = { status: "none" }; cachePut(track.id, d); return d; }
  if (!r.ok) return { status: "none" };                        // 429 (busy) or server error: not cached

  let j;
  try { j = await r.json(); } catch { return { status: "none" }; }
  // Treat everything from the service as untrusted text: strings only, length-limited, shown with textContent.
  const synced = typeof j.syncedLyrics === "string" ? j.syncedLyrics.slice(0, MAX_CHARS) : "";
  const plain = typeof j.plainLyrics === "string" ? j.plainLyrics.slice(0, MAX_CHARS) : "";
  let data = { status: "none" };
  if (!j.instrumental && synced) {
    const lines = parseLrc(synced).filter((l, i, all) => l.text || (all[i + 1] && all[i + 1].text));
    if (lines.length) data = { status: "synced", lines };
  }
  if (data.status === "none" && !j.instrumental && plain.trim()) data = { status: "plain", plain };
  cachePut(track.id, data);
  return data;
}
