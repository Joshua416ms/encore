// Display modes: photos + music widget, full-screen album artwork, lyrics (only when turned on AND the song has
// lyrics), clock.
// The current mode is a class on <body> (mode-photos / mode-artwork / mode-lyrics / mode-clock); CSS shows the layer.
// Navigation: horizontal swipe anywhere that isn't a control, or tap a dot. The choice is saved in settings.
// Vertical swipes are reported to main.js (onVertical): down opens the Spotify screen, up goes to Nightstand.
// They must start away from the top and bottom edges, where iPadOS has its own gestures (Control Centre, Home).
// Every change says who made it: "user" (swipe, dot, keyboard) or "auto" (automatic switching), so automatic
// switching can step back when you choose a screen yourself.
export const ALL_MODES = ["photos", "artwork", "lyrics", "clock"];

// Where a swipe must NOT start: anything you tap or drag on purpose.
const NO_SWIPE = "button, a, input, select, textarea, label, .bar, #sheet, #connect, .dots, .w-size";
// Vertical swipes may start on buttons (the Spotify screen is mostly buttons); the click that would follow is cancelled.
const NO_VSWIPE = "input, select, textarea, .bar, #sheet, #connect, .w-size, .lib-scroll";
const EDGE_ZONE = 56;       // px at the top and bottom of the screen where vertical swipes may not start
const MIN_DISTANCE = 60;    // px the finger must travel sideways
const MAX_TIME = 700;       // ms — a swipe is a quick flick, not a slow drag

export function createModes({ settings, save, isDragging, hasLyrics, onModeChange, onVertical, isPanelOpen }) {
  const body = document.body;
  const dots = [...document.querySelectorAll("#dots button")];
  let swipe = null, swipedAt = 0;

  // Lyrics mode only exists when lyrics are turned on and the current song has some.
  const available = () => ALL_MODES.filter(m => m !== "lyrics" || (settings.lyricsOn && hasLyrics()));

  function set(mode, source = "user") {
    const list = available(), requested = mode;
    if (!list.includes(mode)) mode = mode === "lyrics" ? "artwork" : "photos";   // no lyrics → the cover instead
    for (const m of ALL_MODES) body.classList.toggle("mode-" + m, m === mode);
    dots.forEach(d => {
      d.hidden = !list.includes(d.dataset.mode);
      d.setAttribute("aria-current", String(d.dataset.mode === mode));
    });
    const changed = settings.mode !== mode;
    if (changed) { settings.mode = mode; save(); }
    onModeChange && onModeChange(mode, source, requested);
  }

  // No wrap-around (like iPad StandBy): swiping past the last mode does nothing.
  function step(dir) {
    const list = available(), i = list.indexOf(settings.mode) + dir;
    if (i >= 0 && i < list.length) set(list[i], "user");
  }

  dots.forEach(d => d.addEventListener("click", e => { e.stopPropagation(); set(d.dataset.mode, "user"); }));

  // Pointer Events cover touch, Apple Pencil and mouse with one set of handlers.
  document.addEventListener("pointerdown", e => {
    if (!e.isPrimary) { swipe = null; return; }
    const inEdge = e.clientY < EDGE_ZONE || e.clientY > window.innerHeight - EDGE_ZONE;
    swipe = {
      x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId,
      h: !e.target.closest(NO_SWIPE) && !(isPanelOpen && isPanelOpen()),   // may become a horizontal swipe
      v: !inEdge && !e.target.closest(NO_VSWIPE),                          // may become a vertical swipe
    };
    if (!swipe.h && !swipe.v) swipe = null;
  });
  document.addEventListener("pointerup", e => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const s = swipe; swipe = null;
    if (isDragging()) return;                        // the widget is being moved, not a swipe
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Date.now() - s.t >= MAX_TIME) return;
    const horizontal = Math.abs(dx) > MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5;
    const vertical = Math.abs(dy) > MIN_DISTANCE && Math.abs(dy) > Math.abs(dx) * 1.5;
    if (horizontal && s.h) {
      swipedAt = Date.now();
      step(dx < 0 ? 1 : -1);                          // swipe left → next mode, right → previous
    } else if (vertical && s.v && onVertical) {
      swipedAt = Date.now();
      onVertical(dy > 0 ? "down" : "up");
    }
  });
  // A swipe that started on a button must not also press it.
  document.addEventListener("click", e => {
    if (Date.now() - swipedAt < 400 && e.target.closest("button, a")) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener("pointercancel", () => { swipe = null; });

  return {
    set, step, available,
    refresh: () => set(settings.mode, "auto"),       // re-check availability (e.g. lyrics turned on/off)
    get mode() { return settings.mode; },
    justSwiped: () => Date.now() - swipedAt < 400,   // lets main.js ignore the "click" that ends a swipe
  };
}
