// One shared clock for everything that shows the song position: the widget's and Player screen's bars, the Spotify
// screen's bar and plain (unsynced) lyrics. Saves battery: it ticks once a second, only while a song plays AND
// one of those is on screen, and a 1 s linear CSS transition moves the bars between ticks (the GPU does that,
// not JavaScript). Ticks land just after the song's whole seconds, so the time labels change on time.
// Synced lyrics don't use this: lyricsmode.js sets one timer for the start of the next line.
//
// Call wake() whenever something changes what's on screen or what's playing (poll result, screen change,
// Spotify screen opened, a setting); it repaints at once and starts or stops the ticks.

export function createProgressClock(playback) {
  const subs = new Set();   // { active(): bool, paint(next) } — next = ms until the next tick, 0 = not moving
  let timer = null;

  function wake() {
    clearTimeout(timer);
    timer = null;
    if (document.hidden) return;
    const live = [...subs].filter(s => s.active());
    const s = playback.state;
    let next = 0;
    if (live.length && s && s.isPlaying && s.track) next = 1000 - (playback.position() % 1000) + 20;
    live.forEach(sub => sub.paint(next));
    if (next) timer = setTimeout(wake, next);
  }

  return { add(sub) { subs.add(sub); }, wake };
}

/** Moves bar parts (fill, knob rail) to a song position with a linear transition. set(el, pct) writes the transform.
 *  paint(pos, dur, next, trackId, hard): pos = where the song is now, next = ms until the next tick.
 *  Small corrections from a poll are absorbed smoothly; the bar never steps backwards by a little.
 *  Big changes (seek, new song, a bar that wasn't on screen) jump straight there. */
export function createMover(parts) {
  let shown = null;   // { from, to, at, ms, track } — the last animation we started

  function seen(now) {
    if (!shown) return null;
    const k = shown.ms ? Math.min(1, (now - shown.at) / shown.ms) : 1;
    return shown.from + (shown.to - shown.from) * k;
  }
  function put(pos, dur, ms) {
    const pct = dur ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0;
    for (const [el, set] of parts) {
      // background-color: the accent colour still fades when the song changes (was a CSS rule; inline wins).
      el.style.transition = (ms ? `transform ${ms}ms linear, ` : "") + "background-color 1s";
      set(el, pct);
    }
  }

  return function paint(pos, dur, next, track, hard) {
    const now = performance.now(), was = seen(now);
    // "Fresh" = this bar was moving up to a moment ago, for this same song.
    const fresh = shown && shown.track === track && now < shown.at + shown.ms + 1200;
    const snap = hard || !fresh || !dur || Math.abs(pos - was) > 1500;
    let from = pos, to = pos, ms = 0;
    if (next && dur && !hard) {
      to = Math.min(dur, pos + next);
      ms = next;
      if (!snap) { from = was; if (to < was) to = was; }   // a little behind: hold still a moment, don't jump back
    }
    if (snap) {
      put(pos, dur, 0);
      if (ms) { parts[0][0].offsetWidth; put(to, dur, ms); }   // reflow so the jump isn't animated
    } else {
      put(to, dur, ms);
    }
    shown = { from, to, at: now, ms, track };
  };
}

// Transforms for the bar parts. The fill is full width and slides in from the left (clipped by .bar-track);
// the knob sits at the right end of a full-width rail that slides the same way. Only transform changes, so
// moving them needs no layout.
export const slideFill = (el, pct) => { el.style.transform = `translateX(${pct - 100}%)`; };
