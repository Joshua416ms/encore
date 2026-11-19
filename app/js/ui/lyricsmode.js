// Lyrics mode: shows the current song's lyrics, highlighting the line being sung.
// The Lyrics screen only exists while the current song HAS lyrics (`has`). When that changes, onAvailability(has)
// tells main.js, which moves you to Album art (and back again later; see main.js "lyrics availability").
// While the next song's lyrics are loading, the screen keeps showing the previous lyrics, so there is exactly one
// transition: straight to the new lyrics, or straight to Album art.
import { getLyrics } from "../lyrics/lrclib.js";

const $ = id => document.getElementById(id);

export function createLyricsMode({ playback, settings, onAvailability }) {
  const view = $("lyricsView"), list = $("lyricsLines");
  let trackId, data = { status: "none" }, current = -2, ticket = 0, has = false, loading = false;

  function setHas(v) {
    if (v === has) return;
    has = v;
    onAvailability && onAvailability(has);
  }

  /** Called whenever the playing item changes (and when lyrics are switched on/off). */
  async function update(track) {
    const id = track && settings.lyricsOn ? track.id : null;
    if (id === trackId) return;
    trackId = id;
    const mine = ++ticket;
    if (!id) { loading = false; data = { status: "none" }; list.textContent = ""; setHas(false); return; }
    // Keep showing the old lyrics (and title), frozen, until the new ones are known.
    loading = true;
    const d = await getLyrics(track).catch(() => ({ status: "none" }));
    if (mine !== ticket) return;                     // the song changed while we were waiting
    loading = false;
    data = d;
    current = -2;
    list.style.transform = "";
    $("lyricsTitle").textContent = `${track.title} · ${track.artists}`;
    $("lyricsLogo").href = track.url || "https://open.spotify.com/";
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
    setHas(lines.length > 0);
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
    if (loading || (!force && !document.body.classList.contains("mode-lyrics"))) return;
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

  return { update, refresh: () => tick(true), get has() { return has; } };
}
