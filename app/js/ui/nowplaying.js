// Renders the Now Playing screen from the playback state and wires its controls.
const $ = id => document.getElementById(id);

export function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Two stacked <img> layers; the new image is fully decoded before it fades in, so there is never a blank frame. */
function crossfader(a, b, onHasImage) {
  let front = a, current = undefined, ticket = 0;
  return async url => {
    if (url === current) return;
    current = url;
    const mine = ++ticket;
    if (!url) {
      a.classList.remove("on"); b.classList.remove("on");
      onHasImage && onHasImage(false);
      return;
    }
    const back = front === a ? b : a;
    back.src = url;
    try { await back.decode(); } catch { /* still show it once loaded */ }
    if (mine !== ticket) return;
    back.classList.add("on");
    front.classList.remove("on");
    front = back;
    onHasImage && onHasImage(true);
  };
}

const DEVICE_LABEL = { Computer: "Computer", Smartphone: "Phone", Tablet: "iPad", Speaker: "Speaker", TV: "TV", AVR: "Receiver", STB: "TV box", AudioDongle: "Cast device", GameConsole: "Console", CastVideo: "Cast device", CastAudio: "Cast speaker", Automobile: "Car" };

export function statusMessage(err) {
  if (!err) return "";
  switch (err.reason) {
    case "PREMIUM_REQUIRED": return "Playback controls need Spotify Premium. Song info will keep updating.";
    case "NO_ACTIVE_DEVICE": return "No Spotify device is active. Start playing in the Spotify app, or pick a device in Settings.";
    case "OFFLINE": return "No internet connection. Encore will reconnect on its own.";
    case "RATE_LIMITED": return "Spotify asked Encore to slow down. Updates resume in a few seconds.";
    case "RESTRICTED": return "This device can't be controlled from other apps.";
    case "UNKNOWN": return "Spotify couldn't do that right now.";
  }
  if (err.status === 403) return "Spotify didn't allow that action on this device or track.";
  if (err.status >= 500) return "Spotify is having trouble right now. Retrying.";
  return err.message || "Something went wrong talking to Spotify.";
}

export function createNowPlaying(playback, opts = {}) {
  const art = crossfader($("artA"), $("artB"), has => $("artWrap").classList.toggle("has", has));
  const bar = $("bar"), fill = $("barFill"), knob = $("barKnob");
  let currentTrackId = undefined;
  let premiumBlocked = false;
  let dragging = false, dragRatio = 0;

  /* ---------- controls ---------- */
  $("playBtn").onclick = () => playback.togglePlay();
  $("nextBtn").onclick = () => playback.next();
  $("prevBtn").onclick = () => playback.previous();
  $("shuffleBtn").onclick = () => playback.toggleShuffle();
  $("repeatBtn").onclick = () => playback.cycleRepeat();
  // Tapping the song text shows it in full (Spotify requires truncated metadata to be viewable).
  $("meta").addEventListener("click", () => $("meta").classList.toggle("full"));
  $("meta").addEventListener("keydown", e => { if (e.key === "Enter") $("meta").classList.toggle("full"); });

  function canSeek() {
    const s = playback.state;
    return !!(s && s.track && s.track.duration && !premiumBlocked && !s.disallows.seeking && !(s.device && s.device.restricted));
  }
  function ratioAt(x) {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width));
  }
  bar.addEventListener("pointerdown", e => {
    if (!canSeek()) return;
    dragging = true; dragRatio = ratioAt(e.clientX);
    bar.classList.add("drag"); bar.setPointerCapture(e.pointerId);
    paintProgress();
    e.stopPropagation();
  });
  bar.addEventListener("pointermove", e => { if (dragging) { dragRatio = ratioAt(e.clientX); paintProgress(); } });
  const endDrag = e => {
    if (!dragging) return;
    dragging = false; bar.classList.remove("drag");
    const s = playback.state;
    if (s && s.track) playback.seek(dragRatio * s.track.duration);
    if (e) e.stopPropagation();
  };
  bar.addEventListener("pointerup", endDrag);
  bar.addEventListener("pointercancel", () => { dragging = false; bar.classList.remove("drag"); });
  bar.addEventListener("click", e => e.stopPropagation());
  bar.addEventListener("keydown", e => {
    if (!canSeek()) return;
    const step = e.key === "ArrowRight" ? 10000 : e.key === "ArrowLeft" ? -10000 : 0;
    if (step) { e.preventDefault(); playback.seek(playback.position() + step); }
  });

  /* ---------- progress (local clock between polls) ---------- */
  function paintProgress() {
    const s = playback.state;
    const dur = s && s.track ? s.track.duration : 0;
    const pos = dragging ? dragRatio * dur : playback.position();
    const pct = dur ? (pos / dur) * 100 : 0;
    fill.style.width = pct + "%";
    knob.style.left = pct + "%";
    bar.setAttribute("aria-valuenow", Math.round(pct));
    $("elapsed").textContent = formatTime(pos);
    $("remaining").textContent = dur ? "-" + formatTime(dur - pos) : "0:00";
  }
  setInterval(() => { if (!document.hidden) paintProgress(); }, 250);

  /* ---------- render from state ---------- */
  function render(state, err) {
    if (err && err.reason === "PREMIUM_REQUIRED") premiumBlocked = true;
    const t = state && state.track;

    // text, with a soft swap when the song changes
    const id = t ? t.id : null;
    if (id !== currentTrackId) {
      const meta = $("meta");
      const apply = () => {
        $("title").textContent = t ? t.title : "Nothing playing";
        $("artist").textContent = t ? t.artists : "Start something in Spotify and it will appear here.";
        $("album").textContent = t ? t.album : "";
        document.title = t ? `${t.title} · ${t.artists}` : "Encore";
        meta.classList.remove("swap", "full");
      };
      if (currentTrackId === undefined) apply();
      else { meta.classList.add("swap"); setTimeout(apply, 260); }
      currentTrackId = id;
    }
    art(t ? t.image : null);
    opts.onTrack && opts.onTrack(t || null);   // lets the full-screen artwork mode follow the current song
    // "Open Spotify" links back to the exact song/episode (playback.js only passes open.spotify.com links).
    $("openSpotify").href = (t && t.url) || "https://open.spotify.com/";

    // device
    const dev = state && state.device;
    $("deviceName").textContent = dev ? `Playing on ${dev.name}` : "No active device";
    $("device").title = dev ? (DEVICE_LABEL[dev.type] || dev.type) : "";

    // buttons: enabled only when Spotify says the action is allowed
    const d = (state && state.disallows) || {};
    const restricted = !!(dev && dev.restricted);
    const locked = premiumBlocked || restricted;
    const playBtn = $("playBtn");
    const playing = !!(state && state.isPlaying);
    playBtn.classList.toggle("playing", playing);
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    playBtn.disabled = locked || (playing ? !!d.pausing : !!(t && d.resuming));
    $("prevBtn").disabled = locked || !t || !!d.skipping_prev;
    $("nextBtn").disabled = locked || !t || !!d.skipping_next;
    const sh = $("shuffleBtn");
    sh.disabled = locked || !t || !!d.toggling_shuffle;
    sh.setAttribute("aria-pressed", String(!!(state && state.shuffle)));
    sh.classList.toggle("on", !!(state && state.shuffle));
    const rp = $("repeatBtn"), mode = state ? state.repeat : "off";
    rp.disabled = locked || !t || !!(d.toggling_repeat_context && d.toggling_repeat_track);
    rp.classList.toggle("on", mode !== "off");
    rp.classList.toggle("repeat-one", mode === "track");
    rp.setAttribute("aria-label", `Repeat: ${mode === "track" ? "this song" : mode === "context" ? "on" : "off"}`);
    bar.classList.toggle("locked", !canSeek());

    // status line
    let msg = err && err.reason !== "NOT_CONNECTED" ? statusMessage(err) : "";
    if (!msg && premiumBlocked) msg = statusMessage({ reason: "PREMIUM_REQUIRED" });
    if (!msg && restricted) msg = statusMessage({ reason: "RESTRICTED" });
    if (!msg && state && !t && dev) msg = `${dev.name} is connected but nothing is queued. Press play or start something in Spotify.`;
    if (!msg && !state) msg = "No Spotify device is active. Start playing in the Spotify app, or pick a device in Settings.";
    $("status").hidden = !msg;
    $("status").textContent = msg;

    paintProgress();
  }

  return { render, setPremiumBlocked(v) { premiumBlocked = v; } };
}
