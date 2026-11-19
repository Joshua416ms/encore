// The moon button in the Spotify screen's top bar and its menu: Off, 15, 30, 45, 60 minutes.
// While a timer runs, the button shows the minutes left ("28 min") in the accent colour.
// The timer itself lives in js/sleep.js; this file only draws and reacts to taps.
import { CHOICES } from "../sleep.js";

const $ = id => document.getElementById(id);

export function createSleepButton(timer) {
  const btn = $("libSleep"), menu = $("sleepMenu"), left = $("libSleepLeft");
  let tick = null;

  function render() {
    const on = timer.active(), min = timer.minutesLeft();
    btn.classList.toggle("on", on);
    left.textContent = on ? `${min} min` : "";
    btn.setAttribute("aria-label", on ? `Sleep timer: ${min} minutes left` : "Sleep timer: off");
    clearInterval(tick);
    if (on) tick = setInterval(render, 15000);       // the label only shows whole minutes
    if (!menu.hidden) fillMenu();
  }

  function fillMenu() {
    menu.textContent = "";
    const on = timer.active();
    const item = (label, checked, act) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(checked));
      b.textContent = label;
      b.addEventListener("click", e => { e.stopPropagation(); act(); closeMenu(); });
      menu.append(b);
    };
    item("Off", !on, () => timer.cancel());
    for (const m of CHOICES) item(`${m} minutes`, false, () => timer.set(m));
    if (on) {
      const p = document.createElement("p");
      p.className = "ends";
      p.textContent = "Ends at " + new Date(timer.endsAt()).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      menu.append(p);
    }
  }

  function openMenu() { fillMenu(); menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }
  function closeMenu() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }

  btn.addEventListener("click", e => { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(); });
  menu.addEventListener("click", e => e.stopPropagation());
  // A tap anywhere else in the Spotify screen closes the menu.
  $("library").addEventListener("click", () => closeMenu());
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });

  render();
  return { render, closeMenu };
}
