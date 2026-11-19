// Lyrics mode: shows the current song's lyrics, highlighting the line being sung.
// If a song has no lyrics (or they are still loading), <body> gets the class "lyrics-none" and CSS shows the
// album-art screen instead (your choice: the cover rather than a "no lyrics" message).
import { getLyrics } from "../lyrics/lrclib.js";

const $ = id => document.getElementById(id);

export function createLyricsMode({ playback, settings }) {
  const view = $("lyricsView"), list = $("lyricsLines");
  let trackId, data = { status: "none" }, current = -2, ticket = 0;

  const setNone = v => document.body.classList.toggle("lyrics-none", v);
  setNone(true);

  /** Called whenever the playing item changes (and when lyrics are switched on/off). */
  async function update(track) {
    const id = track && settings.lyricsOn ? track.id : null;
    if (id === trackId) return;
    trackId = id;
    data = { status: "none" };
    current = -2;
    list.textContent = "";
    list.style.transform = "";
    setNone(true);                                   // show the cover while loading or when there are none
    $("lyricsTitle").textContent = track ? `${track.title} · ${track.artists}` : "";
    $("lyricsLogo").href = (track && track.url) || "https://open.spotify.com/";
    if (!id) return;
    const mine = ++ticket;
    const d = await getLyrics(track);
    if (mine !== ticket) return;                     // the song changed while we were waiting
    data = d;
    render();
  }

  function render() {
    list.textContent = "";
    list.classList.toggle("plain", data.status === "plain");
    const lines = data.status === "synced" ? data.lines.map(l => l.text)
      : data.status === "plain" ? data.plain.split(/\r?\n/) : [];
    for (const text of lines) {
      const li = document.createElement("li");
      li.textContent = text || "♪";                  // textContent: lyrics are shown as plain text, never as HTML
      list.append(li);
    }
    setNone(!lines.length);
    tick(true);
  }

  // Index of the line being sung at time ms (binary search over the sorted timestamps).
  function lineAt(ms) {
    const L = data.lines;
    let lo = 0, hi = L.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid].t <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  function tick(force) {
    if (!force && !document.body.classList.contains("mode-lyrics")) return;
    const pos = playback.position() + (settings.lyricsOffset || 0) * 1000;
    if (data.status === "synced") {
      const i = lineAt(pos);
      if (i === current && !force) return;
      current = i;
      [...list.children].forEach((li, k) => { li.classList.toggle("on", k === i); li.classList.toggle("past", k < i); });
      const li = list.children[Math.max(0, i)];
      if (li) list.style.transform = `translateY(${Math.round(view.clientHeight * 0.42 - (li.offsetTop + li.offsetHeight / 2))}px)`;
    } else if (data.status === "plain") {
      // No timestamps: scroll through the text in step with the song's progress.
      const s = playback.state, dur = s && s.track ? s.track.duration : 0;
      const ratio = dur ? Math.min(1, Math.max(0, pos / dur)) : 0;
      list.style.transform = `translateY(${Math.round(view.clientHeight * 0.3 - ratio * Math.max(0, list.scrollHeight - view.clientHeight * 0.4))}px)`;
    }
  }
  setInterval(() => { if (!document.hidden) tick(false); }, 200);

  return { update, refresh: () => tick(true) };
}
