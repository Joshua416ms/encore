// Full-screen album artwork mode (Feature B).
// Spotify's design rules: the cover must not be cropped, blurred or covered, and Spotify must be credited.
// So the whole cover is shown as large as the screen height allows, the space beside it is filled with a
// gradient of colours sampled from the cover's left and right edges, and the Spotify logo sits in a corner.
const $ = id => document.getElementById(id);

export function createArtMode() {
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
        fill.style.setProperty("--fill-l", avg(0));
        fill.style.setProperty("--fill-r", avg(14));
      } catch { resetFill(); }                // canvas refused to read the pixels: plain black is fine
    };
    img.onerror = resetFill;
    img.src = url;
  }
  function resetFill() { fill.style.removeProperty("--fill-l"); fill.style.removeProperty("--fill-r"); }

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
