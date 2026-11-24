// Settings sheet: one scrolling page of rounded groups (Photos · Music widget · Screen · Spotify).
// The few options left are described once in SCHEMA below; renderRows() builds a switch, slider or row of
// segmented buttons for each. Every change is written to `settings`, saved, and applied at once through onChange().
// Everything that used to be a setting but isn't any more lives in FORCED (decided 2026-11-23: "way too many settings").
const $ = id => document.getElementById(id);
const OUT = "cubic-bezier(.16,1,.3,1)";   // same curves as --out / --in in app.css
const IN = "cubic-bezier(.4,0,1,1)";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Segmented controls place their pill as soon as their row is built (the sheet is only moved off screen by a
// transform, so it always has layout), and again, without animation, whenever their size changes.
const placers = new WeakMap();
const resizeObs = new ResizeObserver(entries => entries.forEach(e => placers.get(e.target)?.()));

/** Value roll: the old text slides out one way and fades while the new text slides in from the other (dir ±1). */
function roll(out, text, dir) {
  // While a roll is still running (a fast drag), only the newest value may show: drop every leaving span and
  // write the new text into the arriving one, so an old value never stays on screen.
  const arriving = out.querySelector("span:not([data-leaving])");
  if (reducedMotion() || (arriving && arriving.getAnimations().length)) {
    out.querySelectorAll("span[data-leaving]").forEach(s => s.remove());
    if (arriving) { arriving.textContent = text; return; }
  }
  const n = document.createElement("span");
  n.textContent = text;
  out.append(n);
  if (!arriving) return;
  if (reducedMotion()) { arriving.remove(); return; }
  arriving.dataset.leaving = "1";
  // The old value is gone after 40 ms (opacity) and the whole exit takes 110 ms.
  arriving.animate([{ transform: "none", opacity: 1 }, { opacity: 0, offset: .35 }, { transform: `translateY(${-dir * 9}px)`, opacity: 0 }],
    { duration: 110, easing: IN, fill: "forwards" }).onfinish = () => arriving.remove();
  n.animate([{ transform: `translateY(${dir * 9}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 200, easing: OUT });
}

export const DEFAULTS = {
  // Display mode (swipe or dots): "photos" | "artwork" | "player" | "lyrics" | "clock"
  mode: "photos",
  // Spotify widget: wScale multiplies every size (the − / + buttons change it). Position: a corner preset
  // ("tl","tr","bl","br") or "custom" (dragged); wX/wY = fractions of the free space.
  wScale: 1, wPos: "tr", wX: 1, wY: 0,
  wOpacity: 0.38, artOn: true, artSize: 112,
  // Photos (wallSecs: seconds between photos, one of WALL_STOPS)
  wallCollection: null, wallSecs: 300, wallOrder: "random", bgDim: 0.35, kbOn: true, kbStrength: 0.05,
  // Night mode: "auto" = on a schedule (22:00–07:00), "on", "off"
  nightMode: "auto",
  // Keep the iPad awake while Encore is open (Screen Wake Lock). Nightstand's switch writes this same value.
  wakeOn: true,
};

// No longer settings: always these values. main.js writes them over whatever was saved, on every start.
export const FORCED = {
  wallFade: 2, fgSize: 0.8, bgExtend: true, bgBlur: 20, vignette: 0, wallDim: 0,
  infoOn: true, textScale: 1, albumOn: true, controlsOn: false, extrasOn: false, progressOn: false, accent: "white",
  lyricsOn: true, lyricsOffset: 0,
  clockOn: false, dateOn: false, h24: false, clockSize: 1, clockPos: "tl",
  nightFrom: "22:00", nightTo: "07:00",
  artMargin: 14, artBg: "colors",
};

// Old settings that no longer exist at all: deleted from the saved copy on start (main.js).
export const REMOVED = ["wallInterval", "wallPaused", "wallByPeriod", "autoMode", "autoPhotosAfter",
  // "Settings button on tap" (079c7c1) removed 2026-11-24: a second tap hides the gear instead
  "gearOn",
  // widget sizes removed 2026-11-19 (resizing is the − / + buttons)
  "wWidth", "wHeight", "wPad", "wBlur", "artRadius"];

// Widget sizes that are no longer settings (decided 2026-11-19): always these values.
export const FIXED = { wWidth: 400, wHeight: 0, wPad: 14, wBlur: 24, artRadius: 8 };

// "Change photo every": the slider moves through these steps (seconds).
export const WALL_STOPS = [30, 45, 60, 90, 120, 180, 240, 300];
const secs = v => (v < 60 ? `${v} s` : `${v / 60} min`);
const pct = v => `${Math.round(v * 100)}%`;

export const SCHEMA = {
  photos: [
    { key: "wallSecs", label: "Change photo every", type: "range", stops: WALL_STOPS, fmt: secs },
    { key: "wallOrder", label: "Order", type: "segmented", options: [["random", "Random"], ["sequential", "In order"]] },
    { key: "bgDim", label: "Background darkness", type: "range", min: 0, max: 0.8, step: 0.02, fmt: pct },
    { key: "kbOn", label: "Slow pan and zoom", type: "switch" },
    { key: "kbStrength", label: "Pan and zoom amount", type: "range", min: 0.02, max: 0.1, step: 0.01, fmt: pct },
  ],
  music: [
    { key: "wOpacity", label: "Background darkness", type: "range", min: 0.1, max: 0.9, step: 0.02, fmt: pct },
    { key: "artOn", label: "Show album cover", type: "switch" },
    { key: "artSize", label: "Album cover size", type: "range", min: 48, max: 420, step: 4, fmt: v => `${v} px` },
  ],
  screen: [
    { key: "wakeOn", label: "Keep screen on", type: "switch", note: "Stays awake while Encore or Nightstand is open." },
    { key: "nightMode", label: "Night mode", type: "segmented", options: [["auto", "Schedule"], ["on", "On"], ["off", "Off"]] },
  ],
};

/** Builds one row per schema item. Uses textContent/DOM APIs only (no HTML strings from data). */
function renderRows(container, list, settings, onChange) {
  container.querySelectorAll(".seg").forEach(s => resizeObs.unobserve(s));
  container.textContent = "";
  for (const item of list) {
    const id = "set-" + item.key;
    let el = null;                                    // what goes into the row (the input, or a wrapper around it)
    const row = document.createElement("div");
    row.className = "row" + (item.type === "range" ? " range" : item.type === "segmented" ? " seg-row" : "");
    row.dataset.key = item.key;
    const label = document.createElement(item.type === "segmented" ? "span" : "label");
    label.className = "row-label";
    if (item.type !== "segmented") label.htmlFor = id;
    else label.id = id + "-label";
    label.textContent = item.label;
    row.append(label);
    let input;
    if (item.type === "switch") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.className = "switch";
      input.setAttribute("role", "switch");
      input.checked = !!settings[item.key];
      input.addEventListener("change", () => onChange(item.key, input.checked));
      // Held down, the knob stretches (CSS .switch.press). pointercancel also covers the sheet closing mid-press.
      const sw = input, up = () => sw.classList.remove("press");
      sw.addEventListener("pointerdown", () => sw.classList.add("press"));
      ["pointerup", "pointerleave", "pointercancel"].forEach(t => sw.addEventListener(t, up));
    } else if (item.type === "segmented") {
      input = document.createElement("div");
      input.className = "seg";
      input.setAttribute("role", "radiogroup");
      input.setAttribute("aria-labelledby", id + "-label");
      const seg = input, ind = document.createElement("span");
      ind.className = "ind";
      ind.setAttribute("aria-hidden", "true");
      seg.append(ind);
      let cur = null;                                 // the button the pill sits under
      // Inchworm: the edge in the direction of travel leads (240 ms), the other follows 70 ms later (300 ms).
      const place = (b, animate) => {
        ind.hidden = !b;
        if (!b) return;
        const s = seg.getBoundingClientRect(), r = b.getBoundingClientRect();   // sub-pixel, unlike offsetLeft
        const L = r.left - s.left, R = s.right - r.right;
        const right = cur && r.left > cur.getBoundingClientRect().left;
        ind.style.transition = !animate || reducedMotion() ? "none" : right
          ? `right 240ms ${OUT}, left 300ms ${OUT} 70ms` : `left 240ms ${OUT}, right 300ms ${OUT} 70ms`;
        ind.style.left = L + "px";
        ind.style.right = R + "px";
        cur = b;
      };
      // On resize, snap the pill into place, but never cut short a slide that is playing (the click already measured).
      placers.set(seg, () => { if (!ind.getAnimations().length) place(seg.querySelector('button[aria-checked="true"]'), false); });
      resizeObs.observe(seg);
      for (const [v, t] of item.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t;
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(settings[item.key] === v));
        b.addEventListener("click", () => {
          if (b === cur) return;
          input.querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
          place(b, true);
          onChange(item.key, v);
        });
        input.append(b);
      }
    } else {
      // A slider. With `stops`, it moves through a fixed list of values (index 0…n-1 on the slider).
      input = document.createElement("input");
      input.type = "range";
      const value = () => (item.stops ? item.stops[Number(input.value)] : Number(input.value));
      if (item.stops) {
        input.min = 0; input.max = item.stops.length - 1; input.step = 1;
        const i = item.stops.indexOf(settings[item.key]);
        input.value = i < 0 ? item.stops.length - 1 : i;
      } else {
        input.min = item.min; input.max = item.max; input.step = item.step;
        input.value = settings[item.key];
      }
      // Every slider's value label rolls up or down when its text changes (see roll()).
      const out = document.createElement("output"), first = document.createElement("span");
      out.htmlFor = id;
      out.className = "roll";
      first.textContent = item.fmt(value());
      out.append(first);
      row.append(out);
      let shown = first.textContent, last = Number(input.value);
      const fill = () => {                            // sand fill up to the thumb (WebKit has no ::-moz-range-progress)
        const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
        input.style.setProperty("--fill", p + "%");
      };
      const detent = item.stops ? buildDetents(input, item.stops.length) : null;
      if (detent) el = detent.el;
      else fill();
      input.addEventListener("input", () => {        // "input" fires while dragging → live preview
        const v = value(), t = item.fmt(v), now = Number(input.value);
        if (t !== shown) { roll(out, t, now > last ? 1 : -1); shown = t; }
        last = now;
        if (detent) detent.update();
        else fill();
        onChange(item.key, v);
      });
    }
    input.id = id;
    el = el || input;
    row.append(el);
    container.append(row);
    placers.get(el)?.();                              // container is in the page, so the pill can be measured now
    if (item.note) {
      const p = document.createElement("p");
      p.className = "row-note";
      p.textContent = item.note;
      container.append(p);
    }
  }
}

/** Detents: wraps a stepped range in an overlay that draws the track, a tick per stop and a thumb that glides
 *  160 ms between stops and pulses when the stop changes. (The value label's roll is shared by all sliders.) */
function buildDetents(input, n) {
  const el = document.createElement("div");
  el.className = "det";
  const track = document.createElement("div"), fillEl = document.createElement("div");
  track.className = "det-track";
  fillEl.className = "det-fill";
  track.append(fillEl);
  const ticks = document.createElement("div");
  ticks.className = "det-ticks";
  for (let i = 0; i < n; i++) {
    const t = document.createElement("i");
    t.style.left = (i / (n - 1)) * 100 + "%";
    ticks.append(t);
  }
  const thumb = document.createElement("div"), knob = document.createElement("div");
  thumb.className = "det-thumb";
  knob.className = "det-knob";
  thumb.append(knob);
  el.append(input, track, ticks, thumb);               // the input first, but z-index keeps it on top for touches

  let idx = Number(input.value);
  // Percentages only (see .det-thumb in app.css), so nothing needs measuring and a resize needs no redraw.
  const draw = () => {
    const p = idx / (n - 1);
    fillEl.style.transform = `scaleX(${p})`;
    thumb.style.transform = `translateX(${p * 100}%)`;
  };
  draw();                                              // before it is in the page, so there is nothing to animate from
  return {
    el,
    update() {
      const i = Number(input.value);
      if (i === idx) return;
      idx = i;
      draw();
      if (!reducedMotion()) knob.animate([{ transform: "scale(1.2)" }, { transform: "scale(1)" }], { duration: 200, easing: OUT });
    },
  };
}

export function createSettings({ settings, onChange, client, isConnected, onConnect, onDisconnect, onOpen }) {
  const sheet = $("sheet");

  function renderAll() {
    renderRows($("rowsPhotos"), SCHEMA.photos, settings, onChange);
    renderRows($("rowsMusic"), SCHEMA.music, settings, onChange);
    renderRows($("rowsScreen"), SCHEMA.screen, settings, onChange);
  }

  function open() {
    renderAll();
    sync();
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    staggerRows();
    if (isConnected()) loadAccount();
    onOpen && onOpen(true);
  }
  function close() {
    if (!isOpen()) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    onOpen && onOpen(false);
  }
  const isOpen = () => sheet.classList.contains("open");

  // Slide + settle: the rows follow the sheet in, one after another. Capped at 10 steps so the last one
  // starts by ~420 ms. Rows are rebuilt on every open, so this plays every time. Skipped with reduced motion.
  function staggerRows() {
    if (reducedMotion()) return;
    const rows = ["rowsPhotos", "rowsMusic", "rowsScreen"].flatMap(id => [...$(id).querySelectorAll(".row")]);
    rows.forEach((r, i) => r.animate(
      [{ opacity: 0, transform: "translateX(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 320, delay: 140 + Math.min(i, 10) * 28, easing: OUT, fill: "backwards" }));
  }

  $("gearBtn").addEventListener("click", e => { e.stopPropagation(); open(); });
  $("closeSheet").addEventListener("click", close);
  sheet.addEventListener("click", e => e.stopPropagation());

  function sync() {
    const connected = isConnected();
    $("connectFromSettings").hidden = connected;
    $("disconnectBtn").hidden = !connected;
    if (!connected) $("acctName").textContent = "Not connected";
  }

  async function loadAccount() {
    try {
      const me = await client.me();
      $("acctName").textContent = me.display_name || me.id || "Connected";
    } catch {
      $("acctName").textContent = "Connected";
    }
  }

  $("connectFromSettings").addEventListener("click", () => { close(); onConnect(); });

  $("disconnectBtn").addEventListener("click", () => {
    const b = $("disconnectBtn");
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "Disconnect"; onDisconnect(); sync(); return; }
    b.dataset.armed = "1"; b.textContent = "Tap again to disconnect";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Disconnect"; }, 4000);
  });

  // A setting changed elsewhere (Nightstand's Keep screen on): redraw the rows if the sheet is showing them.
  const refresh = () => { if (isOpen()) renderAll(); };

  return { open, close, isOpen, sync, refresh };
}
