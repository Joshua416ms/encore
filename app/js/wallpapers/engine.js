// Wallpaper engine: shows the active collection full screen and rotates through it.
// Two <img> layers are stacked; the next photo is fully decoded on the hidden layer before it fades in,
// so there is never a blank or half-drawn frame. Only the two visible images are kept in memory.
import { imageKeys, getImage } from "./library.js";

const STATE_KEY = "encore.wall.state";

export function createWallpaperEngine({ layers: [a, b], getSettings, onShow }) {
  let keys = [], collection = null, front = a, currentUrl = null, timer = null, running = false, ticket = 0;
  let st = load();   // { collection, current, bag, history, changedAt } — survives app restarts

  function load() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || "{}"); } catch { return {}; } }
  function persist() { try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch {} }

  function shuffled(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  // Random mode uses a "shuffle bag": every photo is shown once before any repeats.
  function pickNext() {
    if (!keys.length) return null;
    if (getSettings().wallOrder === "sequential") return keys[(keys.indexOf(st.current) + 1) % keys.length];
    if (!st.bag.length) {
      st.bag = shuffled(keys);
      if (st.bag.length > 1 && st.bag[0] === st.current) st.bag.push(st.bag.shift());
    }
    return st.bag.shift();
  }

  async function show(key, { record = true } = {}) {
    const mine = ++ticket;
    if (!key) {
      a.classList.remove("on"); b.classList.remove("on");
      onShow(null);
      return;
    }
    const rec = await getImage(key);
    if (!rec || mine !== ticket) return;
    const url = URL.createObjectURL(rec.display);
    const back = front === a ? b : a;
    // Smart crop: object-fit:cover keeps the aspect ratio; object-position keeps the subject in view.
    back.style.objectPosition = `${(rec.focal?.x ?? 0.5) * 100}% ${(rec.focal?.y ?? 0.5) * 100}%`;
    back.src = url;
    try { await back.decode(); } catch { /* shown once loaded */ }
    if (mine !== ticket) { URL.revokeObjectURL(url); return; }
    back.classList.add("on");
    front.classList.remove("on");
    const oldUrl = currentUrl, oldLayer = front;
    front = back; currentUrl = url;
    if (oldUrl) {
      // Free the previous photo's memory once the crossfade has finished.
      setTimeout(() => { if (oldLayer.src === oldUrl) oldLayer.removeAttribute("src"); URL.revokeObjectURL(oldUrl); },
        (getSettings().wallFade || 2) * 1000 + 600);
    }
    if (record && st.current && st.current !== key) st.history = [...(st.history || []), st.current].slice(-50);
    st.current = key;
    st.changedAt = Date.now();
    persist();
    onShow({ key, lum: rec.lum, w: rec.w, h: rec.h, index: keys.indexOf(key), count: keys.length });
  }

  function schedule() {
    clearTimeout(timer);
    const s = getSettings();
    if (!running || s.wallPaused || !s.wallInterval || keys.length < 2) return;
    const due = (st.changedAt || 0) + s.wallInterval * 60000;
    timer = setTimeout(next, Math.max(1000, due - Date.now()));
  }

  async function next() {
    const k = pickNext();
    if (k) await show(k);
    schedule();
  }

  async function prev() {
    let k = (st.history || []).pop();
    if (!k && getSettings().wallOrder === "sequential" && keys.length) {
      k = keys[(keys.indexOf(st.current) - 1 + keys.length) % keys.length];
    }
    if (!k) return;
    // In random mode, put the current photo back so "next" returns to it.
    if (st.current && getSettings().wallOrder !== "sequential") st.bag.unshift(st.current);
    await show(k, { record: false });
    schedule();
  }

  async function setCollection(id) {
    collection = id || null;
    keys = collection ? await imageKeys(collection) : [];
    if (st.collection !== collection) st = { collection, bag: [], history: [], current: null, changedAt: 0 };
    st.bag = (st.bag || []).filter(k => keys.includes(k));
    st.history = (st.history || []).filter(k => keys.includes(k));
    if (!keys.length) { st.current = null; persist(); await show(null); return; }
    const resuming = keys.includes(st.current);          // same photo as last time the app was open?
    const resume = resuming ? st.current : pickNext();
    const changedAt = st.changedAt;
    await show(resume, { record: false });
    if (resuming && changedAt) { st.changedAt = changedAt; persist(); } // keep the rotation clock across restarts
    schedule();
  }

  return {
    setCollection,
    refresh: () => setCollection(collection),
    next, prev,
    showKey: async k => { await show(k); schedule(); },
    start() { running = true; schedule(); },
    stop() { running = false; clearTimeout(timer); },
    reschedule: schedule,
    get collection() { return collection; },
    get current() { return st.current; },
    get count() { return keys.length; },
  };
}
