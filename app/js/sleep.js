// Sleep timer, shared by Encore and Nightstand (Nightstand loads it with import()).
//
//   You pick 15/30/45/60 min ──▶ the end time is saved in localStorage, so it keeps running when you swipe to
//   Nightstand and back (each app is its own page; a page switch would otherwise lose a JavaScript timer).
//   30 s before the end ──▶ the Spotify volume fades to 0 (only on devices that allow volume control)
//   at the end ──▶ Spotify pauses, the old volume is put back (so tomorrow isn't silent), then onSleep():
//                  the app goes black and stops keeping the screen awake, so the iPad locks by itself.
//
// While the iPad is locked, Safari freezes the page, so nothing here can run. That is why the app keeps the screen
// on while a timer is running, even when "Keep screen on" is off (decision Q8).
import { SPOTIFY_CLIENT_ID } from "./config.js";
import { createClient } from "./spotify/client.js";
import { isConnected } from "./spotify/auth.js";

const KEY = "encore.sleepAt";       // end time in ms since 1970; missing = no timer
const VOL_KEY = "encore.sleepVol";  // volume before the fade, kept in storage in case the page reloads mid-fade
export const FADE_MS = 30000;
export const CHOICES = [15, 30, 45, 60];
// If the page only wakes up long after the end (the iPad was locked anyway), the moment has passed:
// forget the timer instead of pausing music you may have started since.
const LATE_MS = 15 * 60000;

const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};
const wait = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const endAt = () => { const v = Number(ls.get(KEY)); return v > 0 ? v : 0; };

export function createSleepTimer({ onSleep, onChange }) {
  const client = createClient(() => (ls.get("encore.spotify.clientId") || SPOTIFY_CLIENT_ID || "").trim());
  let loop = null, busy = false;

  function changed() { onChange && onChange(); ensureLoop(); }
  function ensureLoop() {
    if (endAt() && !loop) loop = setInterval(check, 1000);
    if (!endAt() && loop) { clearInterval(loop); loop = null; }
  }

  async function restoreVolume() {
    const v = Number(ls.get(VOL_KEY));
    ls.del(VOL_KEY);
    if (v > 0) await client.volume(v).catch(() => {});
  }

  function check() {
    const at = endAt();
    if (!at || busy) return;
    const left = at - Date.now();
    if (left < -LATE_MS) { ls.del(KEY); ls.del(VOL_KEY); changed(); return; }
    if (left <= FADE_MS) finish(at, left);
  }

  async function finish(at, left) {
    busy = true;
    try {
      if (isConnected()) {
        const p = await client.playback().catch(() => null);
        const dev = p && p.device;
        const canFade = p && p.is_playing && dev && dev.supports_volume !== false &&
                        typeof dev.volume_percent === "number" && dev.volume_percent > 0 && left > 3000;
        if (canFade) {
          const start = Number(ls.get(VOL_KEY)) || dev.volume_percent;
          ls.set(VOL_KEY, start);
          const steps = Math.max(1, Math.round(left / 3000));       // one small step every ~3 s
          for (let i = 1; i <= steps; i++) {
            await wait(left / steps);
            if (endAt() !== at) return;                              // cancelled during the fade
            await client.volume(start * (1 - i / steps)).catch(() => {});
          }
        } else {
          await wait(left);
          if (endAt() !== at) return;
        }
        // Ask again: music may have been started or stopped during the last 30 seconds.
        const now = await client.playback().catch(() => null);
        if (now && now.is_playing) await client.pause().catch(() => {});
        await restoreVolume();
      } else {
        await wait(left);
        if (endAt() !== at) return;
      }
      ls.del(KEY);
      changed();
      onSleep && onSleep();
    } finally {
      busy = false;
    }
  }

  // The page was frozen or hidden: catch up as soon as it is visible again.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
  ensureLoop();
  check();

  return {
    /** Start (or restart) the timer for this many minutes. */
    set(minutes) { ls.set(KEY, Date.now() + minutes * 60000); changed(); },
    /** Stop the timer. If the fade had started, the volume goes back up. */
    async cancel() {
      ls.del(KEY); changed();
      if (ls.get(VOL_KEY)) { await wait(600); await restoreVolume(); }   // let a fade step already on its way land first
    },
    active: () => !!endAt() && endAt() > Date.now() - LATE_MS,
    endsAt: endAt,
    /** Whole minutes left, rounded up (0 when no timer). */
    minutesLeft: () => { const at = endAt(); return at ? Math.max(0, Math.ceil((at - Date.now()) / 60000)) : 0; },
  };
}
