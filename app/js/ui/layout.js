// Layout: turns settings into the widget's size/position and places the widget and clock in corners.
//
// How independent sizing works: each setting becomes its own CSS custom property on the widget
// (--w-width, --art, --t, ...). The CSS grid reads them separately, so changing artwork size never
// changes text size or widget width. This file only adds the safety limits (clamps) on top.
const $ = id => document.getElementById(id);

const EDGE = 20;          // must match --edge in app.css
// Feature A limits. 0.8 keeps the song title at ≥ 12.8 px (tested: 0.7 gave 11.2 px, too small at a distance).
export const SCALE_MIN = 0.8, SCALE_MAX = 1.8, SCALE_STEP = 0.1;
const INFO_MIN = 150;     // narrowest text column we allow beside the artwork before stacking
const GAP = 14;           // must match --gap in app.css

export function createLayout({ settings, save, onPositionChange }) {
  const root = document.documentElement;
  const widget = $("widget"), clock = $("clockBlock"), sizeBtns = $("widgetSize");
  const slots = {};
  document.querySelectorAll(".slot").forEach(s => { slots[s.dataset.corner] = s; });
  let lum = null;          // brightness of each corner of the current photo (from the wallpaper engine)

  function apply() {
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
    applyTint();
    $("widgetSmaller").disabled = s.wScale <= SCALE_MIN + 0.001;
    $("widgetLarger").disabled = s.wScale >= SCALE_MAX - 0.001 || scale < s.wScale;  // already as big as the screen allows

    // Clock
    root.style.setProperty("--clock-scale", s.clockSize);
    clock.hidden = !s.clockOn;
    $("today").hidden = !s.dateOn;

    // Photos
    root.style.setProperty("--wall-fade", s.wallFade + "s");
    root.style.setProperty("--wall-dim", s.wallDim);

    place();
  }

  // Readability over bright photos: darken the widget more when its corner of the photo is bright.
  function applyTint() {
    const s = settings;
    const bright = lum ? (lum[s.wPos] ?? 0.5) : 0.4;
    const boost = Math.max(0, bright - 0.5) * 0.8;
    widget.style.setProperty("--w-tint", Math.min(0.9, s.wOpacity + boost).toFixed(3));
    const clockBright = lum ? (lum[s.clockPos] ?? 0.5) : 0.4;
    clock.classList.toggle("on-bright", clockBright > 0.6);
  }

  // Corner slots: the widget and clock each go into one. Same corner → they stack, never overlap.
  function place() {
    const s = settings;
    const wSlot = slots[s.wPos] || slots.tr;
    const cSlot = slots[s.clockPos] || slots.tl;
    if (widget.parentElement !== wSlot) {
      // The +/− buttons travel with the widget: below it in top corners, above it in bottom corners.
      if (s.wPos[0] === "t") wSlot.append(widget, sizeBtns);
      else wSlot.append(sizeBtns, widget);
    }
    if (cSlot === wSlot) wSlot.insertBefore(clock, widget);
    else if (clock.parentElement !== cSlot) cSlot.append(clock);
    requestAnimationFrame(resolveOverlap);
  }

  // A very wide widget can reach the clock's corner. If they touch, move the clock above the widget.
  function resolveOverlap() {
    if (clock.hidden || clock.parentElement === widget.parentElement) return;
    const a = widget.getBoundingClientRect(), b = clock.getBoundingClientRect();
    const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    if (overlap) widget.parentElement.insertBefore(clock, widget);
  }

  // Moving the widget: press and HOLD it (~0.4 s) until it lifts, then drag; on release it snaps to the
  // nearest corner. A quick flick across the widget is left alone, so it can change display modes instead.
  const HOLD_MS = 400;
  let drag = null;
  widget.addEventListener("pointerdown", e => {
    if (e.target.closest("button, a, .bar, input")) return;
    const d = { x: e.clientX, y: e.clientY, id: e.pointerId, armed: false, moved: false };
    d.timer = setTimeout(() => { d.armed = true; widget.classList.add("lifted"); }, HOLD_MS);
    drag = d;
  });
  window.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.armed) {                      // moved before the hold finished → it's a swipe, not a drag
      if (Math.hypot(dx, dy) > 10) { clearTimeout(drag.timer); drag = null; }
      return;
    }
    drag.moved = true;
    widget.classList.add("dragging");
    widget.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    clearTimeout(d.timer);
    widget.classList.remove("lifted");
    if (!d.moved) return;
    const r = widget.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const corner = (cy < innerHeight / 2 ? "t" : "b") + (cx < innerWidth / 2 ? "l" : "r");
    widget.style.transform = "";
    widget.classList.remove("dragging");
    // The release would also count as a tap on the song text; swallow that one click.
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    widget.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => widget.removeEventListener("click", swallow, { capture: true }), 350);
    if (corner !== settings.wPos) { settings.wPos = corner; save(); apply(); onPositionChange && onPositionChange(corner); }
  };
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(apply, 120); });

  // Feature A buttons: change the overall size one step, with a short animation.
  function resize(step) {
    const next = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, settings.wScale + step)) * 10) / 10;
    if (next === settings.wScale) return;
    settings.wScale = next;
    save();
    widget.classList.add("resizing");
    apply();
    clearTimeout(resize.t);
    resize.t = setTimeout(() => widget.classList.remove("resizing"), 350);
  }
  $("widgetSmaller").addEventListener("click", e => { e.stopPropagation(); resize(-SCALE_STEP); });
  $("widgetLarger").addEventListener("click", e => { e.stopPropagation(); resize(SCALE_STEP); });

  return {
    apply,
    isDragging: () => !!(drag && drag.armed),
    setWallpaperInfo(info) { lum = info ? info.lum : null; applyTint(); },
  };
}
