// Layout: turns settings into the widget's size and position, places the clock, and handles dragging.
//
// SIZE — each setting becomes its own CSS custom property on the widget (--w-width, --art, --t, ...).
// The CSS grid reads them separately, so changing artwork size never changes text size or widget width.
//
// POSITION — the widget and its −/+ buttons live in one "dock". Its position is stored as two fractions of the
// free space: wX (0 = left edge … 1 = right edge) and wY (0 = top … 1 = bottom). Because they are fractions,
//   • any value 0–1 is always fully on screen (it can't be lost off the edge),
//   • resizing the widget or rotating the iPad keeps it in the same relative place,
//   • the four corner presets are just (0,0) (1,0) (0,1) (1,1).
const $ = id => document.getElementById(id);

const EDGE = 20;          // must match --edge in app.css
// Feature A limits. 0.8 keeps the song title at ≥ 12.8 px (tested: 0.7 gave 11.2 px, too small at a distance).
export const SCALE_MIN = 0.8, SCALE_MAX = 1.8, SCALE_STEP = 0.1;
const INFO_MIN = 150;     // narrowest text column we allow beside the artwork before stacking
const GAP = 14;           // must match --gap in app.css

export const PRESETS = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };
const HOLD_MS = 400;      // press-and-hold time before the widget lifts and can be dragged
const SLOP = 10;          // px the finger may wander during the hold; more = it's a swipe, not a drag
const SNAP = 32;          // px: dropping this close to a corner snaps exactly into it

const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

export function createLayout({ settings, save, onPositionChange }) {
  const root = document.documentElement;
  const widget = $("widget"), clock = $("clockBlock"), dock = $("dock"), area = $("safeArea");
  const slots = {};
  document.querySelectorAll(".slot").forEach(s => { slots[s.dataset.corner] = s; });
  let lum = null;          // brightness of each corner of the current photo (from the wallpaper engine)

  /* ===================== size ===================== */
  function apply({ animate = false } = {}) {
    const s = settings;
    const vw = window.innerWidth, vh = window.innerHeight;
    const edge = vw <= 520 ? 12 : EDGE;

    // Feature A — overall size: one multiplier for every widget dimension, so proportions never change.
    // If the scaled widget would be wider than the screen, the multiplier is reduced to fit.
    const fitScale = (vw - 2 * edge) / s.wWidth;
    const scale = Math.max(0.5, Math.min(s.wScale, fitScale));

    // Widget size (each setting × scale), limited to what fits on this screen.
    const width = Math.max(220, Math.min(s.wWidth * scale, vw - 2 * edge));
    const pad = s.wPad * scale;
    const inner = width - 2 * pad;

    // Artwork size: your setting × scale, but never wider than the widget or taller than 60% of the screen.
    const art = Math.max(40, Math.min(s.artSize * scale, inner, Math.round(vh * 0.6)));

    // Spotify policy: show artwork and/or song info. If both were off, keep the song info.
    const artOn = !!s.artOn;
    const infoOn = !!s.infoOn || !artOn;

    // Not enough room for text beside the artwork → put the artwork on top.
    const stacked = artOn && inner - art - GAP * scale < INFO_MIN * scale;

    widget.classList.toggle("no-art", !artOn);
    widget.classList.toggle("stacked", stacked);
    widget.classList.toggle("no-info", !infoOn);
    widget.classList.toggle("no-controls", !s.controlsOn);
    widget.classList.toggle("no-extras", !s.extrasOn);
    widget.classList.toggle("no-progress", !s.progressOn);
    widget.classList.toggle("no-album", !s.albumOn);
    root.classList.toggle("accent-white", s.accent === "white");

    const w = widget.style;
    w.setProperty("--w-width", width + "px");
    w.setProperty("--w-height", s.wHeight ? Math.min(s.wHeight, vh - 2 * edge) + "px" : "auto");
    w.setProperty("--w-pad", pad + "px");
    w.setProperty("--w-blur", s.wBlur + "px");
    w.setProperty("--art", art + "px");
    w.setProperty("--art-radius", Math.min(8, Math.max(0, s.artRadius)) + "px");  // Spotify: max 8 px
    w.setProperty("--t", s.textScale * scale);
    w.setProperty("--s", scale);
    $("widgetSmaller").disabled = s.wScale <= SCALE_MIN + 0.001;
    $("widgetLarger").disabled = s.wScale >= SCALE_MAX - 0.001 || scale < s.wScale;  // already as big as the screen allows

    // Clock
    root.style.setProperty("--clock-scale", s.clockSize);
    clock.hidden = !s.clockOn;
    $("today").hidden = !s.dateOn;

    // Photos: whole photo in front, blurred extension behind (each value is its own CSS variable)
    root.style.setProperty("--wall-fade", s.wallFade + "s");
    root.style.setProperty("--wall-dim", s.wallDim);
    root.style.setProperty("--fg-size", s.fgSize);
    root.style.setProperty("--bg-blur", s.bgBlur + "px");
    root.style.setProperty("--bg-dim", s.bgDim);
    root.style.setProperty("--vignette", s.vignette);
    $("backdrop").classList.toggle("no-extend", !s.bgExtend);

    // Album art mode: spacing around the cover, and its background
    root.style.setProperty("--art-margin", s.artMargin + "vmin");
    $("artStage").classList.toggle("plain", s.artBg === "black");

    // A corner preset (from Settings) means fixed fractions; "custom" keeps the dragged fractions.
    if (PRESETS[s.wPos]) [s.wX, s.wY] = PRESETS[s.wPos];
    placeDock(animate);
    applyTint();
  }

  /* ===================== position ===================== */
  // Usable rectangle (edges, iPad safe areas, room for the dots), measured from the invisible #safeArea element.
  const usable = () => area.getBoundingClientRect();

  // Converts the stored fractions into pixels. Called after every size change, rotation or setting change.
  function placeDock(animate) {
    const s = settings;
    const a = usable(), d = dock.getBoundingClientRect();
    const maxX = Math.max(0, a.width - d.width), maxY = Math.max(0, a.height - d.height);
    const x = a.left + clamp01(s.wX) * maxX, y = a.top + clamp01(s.wY) * maxY;
    dock.classList.toggle("no-anim", !animate);
    dock.classList.toggle("above", clamp01(s.wY) > 0.5);   // lower half: −/+ above the widget
    dock.classList.toggle("left", clamp01(s.wX) < 0.5);    // left half: −/+ on the left
    dock.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    dock.classList.add("placed");
    placeClock(x, y);   // immediately, using the target position (not waiting for a frame or the animation)
  }
  // After an animated move, check the clock again against where the widget really ended up.
  dock.addEventListener("transitionend", e => { if (e.target === dock && e.propertyName === "transform") placeClock(); });

  // The widget's size can change by itself (new song title, connect state…): keep it inside the screen.
  if ("ResizeObserver" in window) new ResizeObserver(() => { if (!drag || !drag.armed) placeDock(false); }).observe(widget);

  // Clock: stays in its chosen corner unless the widget is on top of it; then it moves to the corner
  // farthest from the widget (your clock setting is not changed).
  function placeClock(targetX, targetY) {
    if (clock.hidden) return;
    const want = slots[settings.clockPos] || slots.tl;
    if (clock.parentElement !== want) want.append(clock);
    // Widget rectangle: where it is going (if given) or where it is now.
    const r = widget.getBoundingClientRect(), d = dock.getBoundingClientRect();
    const w = targetX === undefined ? r
      : { left: targetX + (r.left - d.left), top: targetY + (r.top - d.top), right: targetX + (r.right - d.left), bottom: targetY + (r.bottom - d.top), width: r.width, height: r.height };
    const c = clock.getBoundingClientRect();
    const overlap = w.left < c.right && c.left < w.right && w.top < c.bottom && c.top < w.bottom;
    if (!overlap) return;
    const cx = w.left + w.width / 2, cy = w.top + w.height / 2;
    const far = (cy < innerHeight / 2 ? "b" : "t") + (cx < innerWidth / 2 ? "r" : "l");
    slots[far].append(clock);
  }

  // Nearest corner of the photo, for readability (the widget can be anywhere now).
  const nearestCorner = () => (settings.wY < 0.5 ? "t" : "b") + (settings.wX < 0.5 ? "l" : "r");

  // Readability over bright photos: darken the widget more when its part of the photo is bright.
  function applyTint() {
    const s = settings;
    const bright = lum ? (lum[nearestCorner()] ?? 0.5) : 0.4;
    const boost = Math.max(0, bright - 0.5) * 0.8;
    widget.style.setProperty("--w-tint", Math.min(0.9, s.wOpacity + boost).toFixed(3));
    const clockCorner = clock.parentElement && clock.parentElement.dataset ? clock.parentElement.dataset.corner : s.clockPos;
    const clockBright = lum ? (lum[clockCorner] ?? 0.5) : 0.4;
    clock.classList.toggle("on-bright", clockBright > 0.6);
  }

  /* ===================== dragging (press, hold, move) =====================
     • Never starts on a control (buttons, links, progress bar) → taps keep working normally.
     • Needs a 0.4 s hold without moving. Moving earlier = a swipe (display modes), and the drag is cancelled.
     • While lifted, the dock follows the finger 1:1 (one update per screen frame) and is clamped to the screen.
     • On release: saved as fractions; within 32 px of a corner it snaps there (animated). */
  let drag = null, frame = 0;
  widget.addEventListener("pointerdown", e => {
    if (!e.isPrimary || e.target.closest("button, a, .bar, input, select")) return;
    if (!document.body.classList.contains("mode-photos")) return;
    const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, armed: false };
    d.timer = setTimeout(() => {
      if (drag !== d) return;
      const r = dock.getBoundingClientRect();
      d.armed = true; d.ox = r.left; d.oy = r.top; d.x = r.left; d.y = r.top;
      dock.classList.add("lifted", "no-anim");
      try { widget.setPointerCapture(d.id); } catch {}   // keep receiving moves even if the finger leaves the widget
    }, HOLD_MS);
    drag = d;
  });

  window.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.armed) {
      if (Math.hypot(dx, dy) > SLOP) { clearTimeout(drag.timer); drag = null; }  // it's a swipe
      return;
    }
    const a = usable(), r = dock.getBoundingClientRect();
    drag.x = Math.min(a.left + Math.max(0, a.width - r.width), Math.max(a.left, drag.ox + dx));
    drag.y = Math.min(a.top + Math.max(0, a.height - r.height), Math.max(a.top, drag.oy + dy));
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (drag && drag.armed) dock.style.transform = `translate3d(${Math.round(drag.x)}px, ${Math.round(drag.y)}px, 0)`;
    });
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    clearTimeout(d.timer);
    if (!d.armed) return;                                   // a normal tap or a swipe: nothing to do
    dock.classList.remove("lifted");
    // The release would also count as a tap on the song text; swallow that one click.
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    widget.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => widget.removeEventListener("click", swallow, { capture: true }), 350);
    if (e.type === "pointercancel") { placeDock(true); return; }   // interrupted (e.g. a system gesture): go back

    const a = usable(), r = dock.getBoundingClientRect();
    const maxX = Math.max(0, a.width - r.width), maxY = Math.max(0, a.height - r.height);
    let fx = maxX ? (d.x - a.left) / maxX : 0.5, fy = maxY ? (d.y - a.top) / maxY : 0.5;
    // Snap to a corner when dropped close to it
    let preset = "custom";
    for (const [name, [px, py]] of Object.entries(PRESETS)) {
      if (Math.abs((px - fx) * maxX) <= SNAP && Math.abs((py - fy) * maxY) <= SNAP) { preset = name; fx = px; fy = py; }
    }
    settings.wX = +clamp01(fx).toFixed(4);
    settings.wY = +clamp01(fy).toFixed(4);
    settings.wPos = preset;
    save();
    placeDock(true);                                        // animates the small snap (or stays put)
    applyTint();
    onPositionChange && onPositionChange(preset);
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => apply(), 120); });

  /* ===================== Feature A: −/+ whole-widget size ===================== */
  // Resizing keeps the position fractions, so the widget stays where you put it (only clamped to fit).
  function resize(step) {
    const next = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, settings.wScale + step)) * 10) / 10;
    if (next === settings.wScale) return;
    settings.wScale = next;
    save();
    widget.classList.add("resizing");
    apply();
    clearTimeout(resize.t);
    resize.t = setTimeout(() => { widget.classList.remove("resizing"); placeDock(true); }, 350);
  }
  $("widgetSmaller").addEventListener("click", e => { e.stopPropagation(); resize(-SCALE_STEP); });
  $("widgetLarger").addEventListener("click", e => { e.stopPropagation(); resize(SCALE_STEP); });

  return {
    apply,
    isDragging: () => !!(drag && drag.armed),
    setWallpaperInfo(info) { lum = info ? info.lum : null; applyTint(); },
  };
}
