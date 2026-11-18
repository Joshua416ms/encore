// Display modes: 1) photos + music widget, 2) full-screen album artwork, 3) clock.
// The current mode is a class on <body> (mode-photos / mode-artwork / mode-clock); CSS shows the right layer.
// Navigation: horizontal swipe anywhere that isn't a control, or tap a dot. The choice is saved in settings.
export const MODES = ["photos", "artwork", "clock"];

// Where a swipe must NOT start: anything you tap or drag on purpose.
const NO_SWIPE = "button, a, input, select, textarea, label, .bar, #sheet, #connect, .dots, .w-size";
const MIN_DISTANCE = 60;    // px the finger must travel sideways
const MAX_TIME = 700;       // ms — a swipe is a quick flick, not a slow drag

export function createModes({ settings, save, isDragging, onModeChange }) {
  const body = document.body;
  const dots = [...document.querySelectorAll("#dots button")];
  let swipe = null, swipedAt = 0;

  function set(mode) {
    if (!MODES.includes(mode)) mode = "photos";
    for (const m of MODES) body.classList.toggle("mode-" + m, m === mode);
    dots.forEach(d => d.setAttribute("aria-current", String(d.dataset.mode === mode)));
    if (settings.mode !== mode) { settings.mode = mode; save(); }
    onModeChange && onModeChange(mode);
  }

  // No wrap-around (like iPad StandBy): swiping past the last mode does nothing.
  function step(dir) {
    const i = MODES.indexOf(settings.mode) + dir;
    if (i >= 0 && i < MODES.length) set(MODES[i]);
  }

  dots.forEach(d => d.addEventListener("click", e => { e.stopPropagation(); set(d.dataset.mode); }));

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
    set, step,
    get mode() { return settings.mode; },
    justSwiped: () => Date.now() - swipedAt < 400,   // lets main.js ignore the "click" that ends a swipe
  };
}
