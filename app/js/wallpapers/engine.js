// Wallpaper engine: shows the active collection full screen and rotates through it.
// Two "slides" are stacked. Each slide = the whole photo (sharp, never cropped) + a blurred copy of its small
// thumbnail behind it. The hidden slide is filled and fully decoded BEFORE it fades in, so there is never a blank
// or half-drawn frame. Only the two slides' images are kept in memory; older ones are released after each fade.
//
// Why not decode the next photo minutes in advance? It would keep a third full-size photo in memory all the time,
// and decoding just before the fade already hides all loading. So we don't.
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

  const held = new Map();   // slide → the object URLs it currently uses (so none is ever forgotten → no memory leak)

  // Fill a slide with one photo and wait until both of its images are decoded. Throws if the photo is unusable.
  async function prepare(slide, rec) {
    const previous = held.get(slide);
    if (previous) { previous.forEach(u => URL.revokeObjectURL(u)); held.delete(slide); }   // slide reused: free its old photo
    const fgUrl = URL.createObjectURL(rec.display);
    const bgUrl = URL.createObjectURL(rec.thumb || rec.display);
    const fg = slide.querySelector(".wp-fg"), bg = slide.querySelector(".wp-bg");
    slide.style.setProperty("--ar", rec.w && rec.h ? (rec.w / rec.h).toFixed(4) : "1.5");
    fg.src = fgUrl;
    bg.src = bgUrl;
    try {
      await fg.decode();                                   // the photo itself must decode, or we skip it
      await bg.decode().catch(() => {});                   // a missing blur background is not fatal
    } catch (e) {
      URL.revokeObjectURL(fgUrl); URL.revokeObjectURL(bgUrl);
      fg.removeAttribute("src"); bg.removeAttribute("src");
      throw e;
    }
    held.set(slide, [fgUrl, bgUrl]);
    return [fgUrl, bgUrl];
  }

  function release(slide, urls) {
    for (const img of slide.querySelectorAll("img")) if (urls.includes(img.src)) img.removeAttribute("src");
    urls.forEach(u => URL.revokeObjectURL(u));
    if (held.get(slide) === urls) held.delete(slide);
  }

  // Free the OLD slide's photo only once the NEW slide has fully faded in. Found in testing: browsers pause CSS
  // transitions in hidden tabs/backgrounded apps, and a fixed timer then stripped a photo that was still on screen
  // (blank frame). Mid-pause, opacity readings can also be misleading, so we require positive proof:
  //   1) the new slide's own "transitionend" (fade-in really finished), or
  //   2) a backup check that sees the new slide at opacity 1 AND the old at 0.
  // If neither ever happens, the old photo is simply kept until that slide is reused: a little memory, never a blank.
  function releaseAfterFadeIn(oldSlide, urls, newSlide) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      newSlide.removeEventListener("transitionend", onEnd);
      if (!oldSlide.classList.contains("on")) release(oldSlide, urls);    // never strip the visible slide
    };
    const onEnd = e => { if (e.target === newSlide && e.propertyName === "opacity" && newSlide.classList.contains("on")) finish(); };
    newSlide.addEventListener("transitionend", onEnd);
    const backup = (tries = 0) => {
      if (done) return;
      if (getComputedStyle(newSlide).opacity === "1" && getComputedStyle(oldSlide).opacity === "0") return finish();
      if (tries < 20) setTimeout(() => backup(tries + 1), 1500);
    };
    setTimeout(backup, (getSettings().wallFade || 2) * 1000 + 600);
  }

  async function show(key, { record = true, attempt = 0 } = {}) {
    const mine = ++ticket;
    if (!key) {
      a.classList.remove("on"); b.classList.remove("on");
      onShow(null);
      return;
    }
    const back = front === a ? b : a;
    let rec, urls;
    try {
      rec = await getImage(key);
      if (!rec || !rec.display) throw new Error("missing");
      if (mine !== ticket) return;
      urls = await prepare(back, rec);
    } catch {
      // Unreadable or missing photo: skip it quietly and try the next one (max 3 in a row, so we never loop forever).
      if (mine !== ticket) return;
      keys = keys.filter(k => k !== key);
      st.bag = (st.bag || []).filter(k => k !== key);
      if (attempt < 2 && keys.length) return show(pickNext(), { record, attempt: attempt + 1 });
      return;
    }
    if (mine !== ticket) { release(back, urls); return; }
    back.classList.add("on");
    front.classList.remove("on");
    const oldUrls = currentUrl, oldSlide = front;
    front = back; currentUrl = urls;
    if (oldUrls) releaseAfterFadeIn(oldSlide, oldUrls, back);   // free the previous photo once the new one fully shows
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
