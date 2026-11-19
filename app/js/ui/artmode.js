// Full-screen album artwork mode (Feature B).
// Spotify's design rules: the cover must not be cropped, blurred or covered, and Spotify must be credited.
// So the whole cover is shown as large as the screen height allows, the space beside it is filled with a
// gradient of colours sampled from the cover's left and right edges, and the Spotify logo sits in a corner.
const $ = id => document.getElementById(id);

export function createArtMode({ onAccent } = {}) {
  const root = document.documentElement;
  const a = $("stageArtA"), b = $("stageArtB"), fill = $("artFill"), msg = $("stageMsg"), logo = $("stageLogo");
  let front = a, current, ticket = 0;

  // Reads the average colour of a 2-pixel-wide strip at each side of a 16×16 copy of the cover.
  // This works because Spotify's image server sends "Access-Control-Allow-Origin: *" (checked 2026-11-18).
  function sampleEdges(url, mine) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (mine !== ticket) return;
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, 16, 16);
        const avg = x => {
          const d = g.getImageData(x, 0, 2, 16).data;
          let r = 0, gr = 0, bl = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; bl += d[i + 2]; }
          const n = d.length / 4, k = 0.8;   // slightly darker than the edge so the cover stands out
          return `rgb(${Math.round(r / n * k)},${Math.round(gr / n * k)},${Math.round(bl / n * k)})`;
        };
        // On the page root, so the Lyrics screen can use the same colours as its background.
        root.style.setProperty("--fill-l", avg(0));
        root.style.setProperty("--fill-r", avg(14));
        onAccent && onAccent(accentFrom(g.getImageData(0, 0, 16, 16).data));
      } catch { resetFill(); }                // canvas refused to read the pixels: plain black is fine
    };
    img.onerror = resetFill;
    img.src = url;
  }
  function resetFill() {
    root.style.removeProperty("--fill-l"); root.style.removeProperty("--fill-r");
    onAccent && onAccent(null);
  }

  // Accent colour (feature 3): the most vivid colour on the cover, made light enough to read on the dark widget.
  // Returns null when the cover is basically black/white/grey (→ the caller falls back to Spotify green).
  function accentFrom(px) {
    let best = null, bestScore = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      const score = s * (1 - Math.abs(l - 0.5) * 1.6);       // vivid, not too dark or too light
      if (score > bestScore) { bestScore = score; best = [h, s, l]; }
    }
    if (!best || best[1] < 0.25 || bestScore < 0.12) return null;
    const [h, s, l] = best;
    return `hsl(${Math.round(h * 360)} ${Math.round(Math.min(1, s * 1.1) * 100)}% ${Math.round(Math.max(0.62, Math.min(0.75, l)) * 100)}%)`;
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }

  async function show(url) {
    if (url === current) return;
    current = url;
    const mine = ++ticket;
    if (!url) { a.classList.remove("on"); b.classList.remove("on"); resetFill(); return; }
    const back = front === a ? b : a;
    back.src = url;
    try { await back.decode(); } catch { /* shown once loaded */ }
    if (mine !== ticket) return;
    back.classList.add("on");
    front.classList.remove("on");
    front = back;
    sampleEdges(url, mine);
  }

  /** Called whenever the playing item changes. track = normalized track from playback.js, or null. */
  function update(track, connected) {
    show(track ? track.image : null);
    msg.textContent = !connected ? "Connect Spotify to show album artwork here."
      : !track ? "Nothing is playing on Spotify."
      : "";
    logo.hidden = !track;
    logo.href = (track && track.url) || "https://open.spotify.com/";   // url is already checked in playback.js
  }

  return { update };
}
