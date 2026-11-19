// Display modes: photos + music widget, full-screen album artwork, lyrics (only when turned on), clock.
// The current mode is a class on <body> (mode-photos / mode-artwork / mode-lyrics / mode-clock); CSS shows the layer.
// Navigation: horizontal swipe anywhere that isn't a control, or tap a dot. The choice is saved in settings.
// Every change says who made it: "user" (swipe, dot, keyboard) or "auto" (automatic switching), so automatic
// switching can step back when you choose a screen yourself.
export const ALL_MODES = ["photos", "artwork", "lyrics", "clock"];

// Where a swipe must NOT start: anything you tap or drag on purpose.
const NO_SWIPE = "button, a, input, select, textarea, label, .bar, #sheet, #connect, .dots, .w-size";
const MIN_DISTANCE = 60;    // px the finger must travel sideways
const MAX_TIME = 700;       // ms — a swipe is a quick flick, not a slow drag

export function createModes({ settings, save, isDragging, onModeChange }) {
  const body = document.body;
  const dots = [...document.querySelectorAll("#dots button")];
  let swipe = null, swipedAt = 0;

  // Lyrics mode only exists when lyrics are turned on.
  const available = () => ALL_MODES.filter(m => m !== "lyrics" || settings.lyricsOn);

  function set(mode, source = "user") {
    const list = available();
    if (!list.includes(mode)) mode = "photos";
    for (const m of ALL_MODES) body.classList.toggle("mode-" + m, m === mode);
    dots.forEach(d => {
      d.hidden = !list.includes(d.dataset.mode);
      d.setAttribute("aria-current", String(d.dataset.mode === mode));
    });
    const changed = settings.mode !== mode;
    if (changed) { settings.mode = mode; save(); }
    onModeChange && onModeChange(mode, source, changed);
  }

  // No wrap-around (like iPad StandBy): swiping past the last mode does nothing.
  function step(dir) {
    const list = available(), i = list.indexOf(settings.mode) + dir;
    if (i >= 0 && i < list.length) set(list[i], "user");
  }

  dots.forEach(d => d.addEventListener("click", e => { e.stopPropagation(); set(d.dataset.mode, "user"); }));

  // Pointer Events cover touch, Apple Pencil and mouse with one set of handlers.
  document.addEventListener("pointerdown", e => {
    swipe = !e.isPrimary || e.target.closest(NO_SWIPE) ? null : { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  });
  document.addEventListener("pointerup", e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe; swipe = null;
    if (isDragging()) return;                        // the widget is being moved, not a swipe
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    const horizontal = Math.abs(dx) > MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5;
    if (horizontal && Date.now() - s.t < MAX_TIME) {
      swipedAt = Date.now();
      step(dx < 0 ? 1 : -1);                          // swipe left → next mode, right → previous
    }
  });
  document.addEventListener("pointercancel", () => { swipe = null; });

  return {
    set, step, available,
    refresh: () => set(settings.mode, "auto"),       // re-check availability (e.g. lyrics turned on/off)
    get mode() { return settings.mode; },
    justSwiped: () => Date.now() - swipedAt < 400,   // lets main.js ignore the "click" that ends a swipe
  };
}
