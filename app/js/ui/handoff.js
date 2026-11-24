// Cover hand-off between the Album art and Player screens: while the two screens crossfade (0.6 s, in CSS), a copy
// of the cover flies from where it sits on one screen to where it sits on the other. The real covers are hidden
// (body.handoff) during the flight. The copy uses object-fit:contain, so the cover is never cropped (Spotify rule).
// Skipped with reduced motion (the crossfade stays). A new mode change during a flight ends it at once.
const OUT = "cubic-bezier(.16,1,.3,1)";   // same curve as --out in app.css
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAIR = ["artwork", "player"];

// The box that holds the visible cover on each screen, and the <img> showing it.
const BOX = { artwork: ".stage-art.on", player: ".pl-art" };
const IMG = { artwork: ".stage-art.on", player: ".pl-art-layer.on" };

export function createHandoff() {
  let flight = null;

  function end() {
    if (!flight) return;
    flight.anim.cancel();
    flight.el.remove();
    document.body.classList.remove("handoff");
    flight = null;
  }

  // Called before the mode classes change. Returns a function to call right after they changed (or null).
  function prepare(from, to) {
    end();
    if (from === to || !PAIR.includes(from) || !PAIR.includes(to) || reducedMotion()) return null;
    const box = document.querySelector(BOX[from]), img = document.querySelector(IMG[from]);
    const src = img && (img.currentSrc || img.src);
    if (!box || !src || !img.complete || !img.naturalWidth) return null;
    const r1 = box.getBoundingClientRect();
    if (!r1.width) return null;
    return () => {
      const target = document.querySelector(BOX[to]), timg = document.querySelector(IMG[to]);
      if (!target || !timg || (timg.currentSrc || timg.src) !== src) return;    // no cover there, or a different one
      const r2 = target.getBoundingClientRect();
      if (!r2.width) return;
      const el = document.createElement("img");
      el.className = "flight"; el.alt = ""; el.src = src;
      el.style.width = r1.width + "px"; el.style.height = r1.height + "px";
      document.body.appendChild(el);
      document.body.classList.add("handoff");
      const anim = el.animate([
        { transform: `translate(${r1.left}px,${r1.top}px)` },
        { transform: `translate(${r2.left}px,${r2.top}px) scale(${r2.width / r1.width})` },
      ], { duration: 520, easing: OUT, fill: "forwards" });
      flight = { el, anim };
      anim.onfinish = () => { if (flight && flight.anim === anim) end(); };
    };
  }

  return { prepare };
}
