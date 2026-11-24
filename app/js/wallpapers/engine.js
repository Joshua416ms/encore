// Wallpaper engine: shows the active collection full screen and rotates through it.
// Two "slides" are stacked. Each slide = the whole photo (sharp, never cropped) + a blurred copy of its small
// thumbnail behind it. The hidden slide is filled and fully decoded BEFORE it fades in, so there is never a blank
// or half-drawn frame. Only the two slides' images are kept in memory; older ones are released after each fade.
//
// Why not decode the next photo minutes in advance? It would keep a third full-size photo in memory all the time,
// and decoding just before the fade already hides all loading. So we don't.
import { imageKeys, getImage } from "./library.js";

const STATE_KEY = "encore.wall.state";

// The blurred background is blurred ONCE, here, into a small picture, instead of with a CSS filter. A live CSS
// blur on a full-screen layer that pans and zooms is redone by the GPU on every frame, for hours; a picture that is
// already blurred costs almost nothing to move. Canvas filters need Safari 18+; elsewhere bake() returns null and
// the CSS filter is used as before.
const canvasFilter = (() => {
  try { const g = document.createElement("canvas").getContext("2d"); g.filter = "blur(1px)"; return g.filter === "blur(1px)"; }
  catch { return false; }
})();
const BG_EDGE = 360;   // same size as the import thumbnail: once blurred, more pixels look identical

async function bake(blob, blurPx) {
  if (!canvasFilter || !blurPx) return null;
  let bmp;
  try {
    bmp = await createImageBitmap(blob);
    const k0 = Math.min(1, BG_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k0)), h = Math.max(1, Math.round(bmp.height * k0));
    // .wp-bg is 116% of the screen with object-fit: cover, so it is enlarged k times on screen. Blur by blurPx / k
    // here to match the old CSS blur in screen pixels.
    const k = Math.max((innerWidth * 1.16) / w, (innerHeight * 1.16) / h);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, w, h);                       // sharp copy underneath, so the blurred edges don't fade to black
    g.filter = `blur(${(blurPx / k).toFixed(2)}px) saturate(1.15)`;
    g.drawImage(bmp, 0, 0, w, h);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
  } catch {
    return null;
  } finally {
    if (bmp && bmp.close) bmp.close();
  }
}

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

  // Slow pan & zoom WITHOUT cropping: the whole photo grows a little and drifts, but only into the empty space
  // around it. ks (zoom) is capped so the photo still fits the screen; kx/ky (drift) are capped by the space
  // left over after zooming. So the photo can never be cut off or leave the screen. Also prevents OLED burn-in.
  function kenBurns(slide, rec) {
    const s = getSettings();
    const on = !!s.kbOn && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    slide.classList.toggle("kb", on);
    if (!on) return;
    const vw = innerWidth, vh = innerHeight, ar = rec.w && rec.h ? rec.w / rec.h : 1.5;
    const fgW = Math.min(vw * s.fgSize, vh * s.fgSize * ar), fgH = fgW / ar;
    const room = Math.min(vw / fgW, vh / fgH) * 0.985;                  // biggest zoom that still fits
    const ks = Math.max(1, Math.min(1 + s.kbStrength, room));
    const maxDx = Math.max(0, (vw - fgW * ks) / 2 - 6), maxDy = Math.max(0, (vh - fgH * ks) / 2 - 6);
    const dir = () => (Math.random() < 0.5 ? -1 : 1);
    slide.style.setProperty("--ks", ks.toFixed(4));
    slide.style.setProperty("--kx", (dir() * maxDx * 0.7).toFixed(1) + "px");
    slide.style.setProperty("--ky", (dir() * maxDy * 0.7).toFixed(1) + "px");
  }

  const held = new Map();   // slide → the object URLs it currently uses (so none is ever forgotten → no memory leak)

  // Wait until an image is ready to show. decode() is best (no half-drawn frame), but browsers can leave it pending
  // while the page isn't being drawn (found in testing: it never settled in a hidden pane). So if decode() hasn't
  // finished after 2.5 s and the image has fully loaded anyway, we go ahead. A broken image still rejects.
  function ready(img) {
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = () => { if (!done) { done = true; resolve(); } };
      const fail = e => { if (!done) { done = true; reject(e); } };
      img.decode().then(ok, () => (img.complete && img.naturalWidth > 0 ? ok() : fail(new Error("decode"))));
      const check = () => { if (done) return; if (img.complete) { if (img.naturalWidth > 0) ok(); else fail(new Error("broken")); } else setTimeout(check, 500); };
      setTimeout(check, 2500);
    });
  }

  // Fill a slide with one photo and wait until both of its images are decoded. Throws if the photo is unusable.
  async function prepare(slide, rec) {
    const previous = held.get(slide);
    if (previous) { previous.forEach(u => URL.revokeObjectURL(u)); held.delete(slide); }   // slide reused: free its old photo
    const baked = await bake(rec.thumb || rec.display, getSettings().bgBlur);
    const fgUrl = URL.createObjectURL(rec.display);
    const bgUrl = URL.createObjectURL(baked || rec.thumb || rec.display);
    const fg = slide.querySelector(".wp-fg"), bg = slide.querySelector(".wp-bg");
    bg.classList.toggle("baked", !!baked);              // baked → no CSS filter (see app.css .wp-bg.baked)
    slide.style.setProperty("--ar", rec.w && rec.h ? (rec.w / rec.h).toFixed(4) : "1.5");
    kenBurns(slide, rec);
    fg.src = fgUrl;
    bg.src = bgUrl;
    try {
      await ready(fg);                                     // the photo itself must load, or we skip it
      await ready(bg).catch(() => {});                     // a missing blur background is not fatal
    } catch (e) {
      // Only clean up images that are still OURS. If a newer load already put its own photo into this slide
      // (quick double tap), removing that would make the newer photo look "broken" (found in testing).
      if (fg.src === fgUrl) fg.removeAttribute("src");
      if (bg.src === bgUrl) bg.removeAttribute("src");
      URL.revokeObjectURL(fgUrl); URL.revokeObjectURL(bgUrl);
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

  // wallSecs: seconds between photos (one of WALL_STOPS in ui/settings.js).
  function schedule() {
    clearTimeout(timer);
    const s = getSettings();
    if (!running || !s.wallSecs || keys.length < 2) return;
    const due = (st.changedAt || 0) + s.wallSecs * 1000;
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
    // Same photo as last time the app was open?
    const resuming = keys.includes(st.current);
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
