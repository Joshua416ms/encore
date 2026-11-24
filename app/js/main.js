// Entry point: creates each component and connects them with small callbacks.
//
//   wallpapers/engine ──onShow(info)──▶ main ──▶ layout.setWallpaperInfo (widget gets darker over bright photos)
//                                            └─▶ photos.markCurrent     (highlights the thumbnail)
//   ui/settings ──onChange(key)──▶ main ──▶ layout.apply / engine.reschedule / clock
//   spotify/playback ──onChange(state)──▶ main ──▶ nowPlaying.render (the widget's contents)
//   nowPlaying ──onTrack(track)──▶ main ──▶ artMode.update (cover; reports its accent colour back)
//                                       └─▶ player.update  (Player screen: cover and song text)
//                                       └─▶ lyrics.update  (LRCLIB lyrics, only when turned on)
//   modes ──onVertical("down"|"up")──▶ main ──▶ library.open/close (Spotify screen) or slide up the Nightstand sheet
//   Nightstand iframe ──postMessage {close}──▶ main ──▶ slide the sheet down; main ──{shown, asleep}──▶ Nightstand
//   every minute ──▶ night mode on/off
//   sleep (js/sleep.js) ──onSleep──▶ main ──▶ black sleep screen, stop polling, let the iPad lock
//
// Components never reach into each other directly, so each can be changed or replaced on its own.
import { SPOTIFY_CLIENT_ID } from "./config.js";
import { redirectUri, beginLogin, handleRedirect, isConnected, logout, canSignIn, missingScopes } from "./spotify/auth.js";
import { createClient } from "./spotify/client.js";
import { createPlayback } from "./spotify/playback.js";
import { createNowPlaying } from "./ui/nowplaying.js";
import { createSettings, DEFAULTS, FORCED, REMOVED, WALL_STOPS } from "./ui/settings.js";
import { createLayout } from "./ui/layout.js";
import { createPhotos } from "./ui/photos.js";
import { createWallpaperEngine } from "./wallpapers/engine.js";
import { createModes } from "./ui/modes.js";
import { createArtMode } from "./ui/artmode.js";
import { createPlayerMode } from "./ui/playermode.js";
import { createLyricsMode } from "./ui/lyricsmode.js";
import { createLibrary } from "./ui/library.js";
import { createSleepTimer } from "./sleep.js";
import { createSleepButton } from "./ui/sleepbutton.js";

const $ = id => document.getElementById(id);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- settings (persisted in localStorage as one JSON object) ---------- */
let saved = {};
try { saved = JSON.parse(ls.get("encore.settings") || "{}") || {}; } catch {}
const settings = { ...DEFAULTS, ...saved };
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ls.set("encore.settings", JSON.stringify(settings)), 150); };
// Settings removed 2026-11-23 ("way too many settings"): old keys are forgotten, the rest are always FORCED.
if (!WALL_STOPS.includes(settings.wallSecs)) settings.wallSecs = 300;
for (const k of REMOVED) delete settings[k];
Object.assign(settings, FORCED);
ls.set("encore.settings", JSON.stringify(settings));
const clientId = () => (ls.get("encore.spotify.clientId") || SPOTIFY_CLIENT_ID || "").trim();

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

/* ---------- clock ---------- */
function tickClock() {
  const d = new Date();
  const date = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  $("clock").textContent = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !settings.h24 });
  $("today").textContent = date;
  // Clock mode: big digits without AM/PM, like StandBy
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
  $("bigTime").textContent = settings.h24 ? `${String(h).padStart(2, "0")}:${m}` : `${h % 12 || 12}:${m}`;
  $("bigDate").textContent = date;
}
setInterval(() => { if (!document.hidden) tickClock(); }, 5000);

/* ---------- night mode ---------- */
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function isNight(d = new Date()) {
  if (settings.nightMode === "on") return true;
  if (settings.nightMode === "off") return false;
  const now = d.getHours() * 60 + d.getMinutes(), a = toMin(settings.nightFrom), b = toMin(settings.nightTo);
  return a <= b ? now >= a && now < b : now >= a || now < b;        // the window may cross midnight
}
function applyNight() { document.documentElement.classList.toggle("night", isNight()); }

// Shows your active collection (switches the engine only when it changed, or when forced).
let syncing = Promise.resolve();
function syncCollection(force = false) {
  syncing = syncing.then(async () => {
    const want = settings.wallCollection;
    if (force || want !== engine.collection) { try { await engine.setCollection(want); } catch { /* storage unavailable */ } }
    updateEmpty();
  });
  return syncing;
}

/* ---------- components ---------- */
const layout = createLayout({ settings, save, onPositionChange: () => settingsUI.sync() });

const engine = createWallpaperEngine({
  layers: [$("wpA"), $("wpB")],
  getSettings: () => settings,
  onShow(info) {
    layout.setWallpaperInfo(info);
    photos.markCurrent(info && info.key);
    updateEmpty();
  },
});
const photos = createPhotos({ settings, save, engine, toast, onCollectionChange: force => syncCollection(force) });

function updateEmpty() {
  const has = engine.count > 0;
  $("emptyHint").hidden = has;
  document.body.classList.toggle("has-photos", has);
}

const client = createClient(clientId);
// onChange only fires after playback.start(), by which time nowPlaying exists.
const playback = createPlayback(client, (state, err) => {
  if (err && err.reason === "NOT_CONNECTED" && !isConnected()) {
    setConnected(false);
    toast("Your Spotify session ended. Connect again to continue.");
    return;
  }
  nowPlaying.render(state, err);
  player.render(state, err);
  library.render(state);
  if (settingsUI.isOpen()) settingsUI.sync();
});

// Accent colour (feature 3): from the album art, Spotify green, or white.
let artAccent = null;
function applyAccent() {
  const root = document.documentElement;
  if (settings.accent === "art") root.style.setProperty("--accent", artAccent || "#1ed760");   // fallback: Spotify green
  else root.style.removeProperty("--accent");
}
const artMode = createArtMode({ onAccent: c => { artAccent = c; applyAccent(); } });
const lyrics = createLyricsMode({ playback, settings, onAvailability: lyricsAvailability });
let lastTrack = null;
const nowPlaying = createNowPlaying(playback, {
  onTrack: t => { lastTrack = t; artMode.update(t, true); player.update(t, true); lyrics.update(t); library.onTrack(); },
});
const player = createPlayerMode({ playback, isPremiumBlocked: () => nowPlaying.premiumBlocked });

// The Spotify screen (swipe down). Reconnecting is needed once for sign-ins made before it existed.
const library = createLibrary({ client, playback, toast, missingScopes, onReconnect: () => openConnect() });

/* ---------- lyrics availability ----------
   The Lyrics screen only exists while the song has lyrics. If you were on it and the next song has none, Encore
   moves you to Album art and remembers that (returnToLyrics); when a later song has lyrics, it takes you back.
   Choosing a screen yourself (swipe, dot, key) forgets that memory: your choice wins. */
let returnToLyrics = false;
function lyricsAvailability(has) {
  if (has && returnToLyrics && modes.mode === "artwork") modes.set("lyrics", "auto");
  else modes.refresh();                                  // hides/shows the dot; leaves Lyrics if it just vanished
}

const modes = createModes({
  settings, save,
  isDragging: () => layout.isDragging(),
  hasLyrics: () => lyrics.has,
  isPanelOpen: () => library.isOpen(),
  onVertical(dir) {
    if (settingsUI.isOpen() || !$("connect").hidden) return;
    if (library.isOpen()) { if (dir === "up") library.close(); return; }
    if (dir === "down") { if (isConnected()) library.open(); else openConnect(); }
    else goNightstand();
  },
  onModeChange(mode, source, requested) {
    document.body.classList.remove("ui");
    if (source === "user" || mode !== "artwork") returnToLyrics = false;
    if (requested === "lyrics" && mode === "artwork" && settings.lyricsOn) returnToLyrics = true;
    if (mode === "lyrics") lyrics.refresh();
  },
});

const WALL_KEYS = ["wallSecs", "wallOrder"];
const settingsUI = createSettings({
  settings, client, isConnected,
  onChange(key, value) {
    settings[key] = value;
    save();
    layout.apply();
    if (WALL_KEYS.includes(key)) engine.reschedule();
    if (key === "kbOn" || key === "kbStrength") syncCollection(true); // re-show so the new motion applies now
    if (key === "nightMode") applyNight();
    if (key === "wakeOn") { if (wakeWanted()) requestWake(); else releaseWake(); }
    if (key === "gearOn") applyGear();
  },
  onOpen(open) { if (open) photos.render(); else photos.release(); },
  onConnect: () => openConnect(),
  onDisconnect() { logout(); playback.stop(); nowPlaying.setPremiumBlocked(false); library.close(); library.reset(); setConnected(false); },
});

/* ---------- Spotify connection state ---------- */
function setConnected(on) {
  $("widget").classList.toggle("disconnected", !on);
  $("widgetConnect").hidden = on;
  if (!on) { artMode.update(null, false); player.update(null, false); player.render(null); lyrics.update(null); }
  if (on && !document.hidden) playback.start();
  if (!on) playback.stop();
}

/* ---------- connect pop-up ---------- */
const REDIRECT = redirectUri();
$("redirectUri").textContent = REDIRECT;
async function copyRedirect(codeEl) {
  try { await navigator.clipboard.writeText(REDIRECT); toast("Redirect URI copied"); }
  catch {
    const r = document.createRange(); r.selectNodeContents(codeEl);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast("Selected. Copy it from the menu.");
  }
}
$("copyRedirect").onclick = () => copyRedirect($("redirectUri"));

function openConnect(error) {
  $("connect").hidden = false;
  $("clientId").value = clientId();
  if (!canSignIn()) error = "Spotify sign-in needs a secure address (https://, or http://127.0.0.1 while testing).";
  $("connectError").hidden = !error;
  $("connectError").textContent = error || "";
}
const closeConnect = () => { $("connect").hidden = true; };
$("openConnect").addEventListener("click", e => { e.stopPropagation(); openConnect(); });
$("closeConnect").addEventListener("click", closeConnect);
$("connect").addEventListener("click", e => { e.stopPropagation(); if (e.target === $("connect")) closeConnect(); });

async function connect() {
  const id = $("clientId").value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    $("connectError").hidden = false;
    $("connectError").textContent = "That doesn't look like a Client ID. It's 32 letters and numbers, shown on your app's page in the Spotify dashboard.";
    return;
  }
  ls.set("encore.spotify.clientId", id);
  $("connectBtn").disabled = true;
  try { await beginLogin(id); }
  catch { $("connectBtn").disabled = false; openConnect("Couldn't start Spotify sign-in on this browser."); }
}
$("connectBtn").addEventListener("click", connect);
$("clientId").addEventListener("keydown", e => { if (e.key === "Enter") connect(); });

/* ---------- empty state ---------- */
$("openPhotos").addEventListener("click", e => { e.stopPropagation(); settingsUI.open(); });

/* ---------- photo navigation: ‹ › buttons (after a tap) and the ↑ ↓ keys. Swipes change display modes. ---------- */
$("wpPrev").addEventListener("click", e => { e.stopPropagation(); engine.prev(); showUI(); });
$("wpNext").addEventListener("click", e => { e.stopPropagation(); engine.next(); showUI(); });

/* ---------- Settings button: shown with a tap, unless "Settings button on tap" is off.
   Press and hold the screen (0.6 s, finger still) always opens Settings, so it's never out of reach. ---------- */
function applyGear() { document.body.classList.toggle("no-gear", !settings.gearOn); }
const HOLD_MS = 600, HOLD_SLOP = 10;
let holdTimer = null, holdX = 0, holdY = 0, heldOpen = false;
const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
document.addEventListener("pointerdown", e => {
  cancelHold();
  heldOpen = false;
  if (!e.isPrimary || settingsUI.isOpen() || asleep || document.body.classList.contains("lib-open")) return;
  if (e.target.closest("button, a, input, select, textarea, #widget, #sheet, #library, #connect, #dots, #sleepScreen, .bar")) return;
  holdX = e.clientX; holdY = e.clientY;
  holdTimer = setTimeout(() => { holdTimer = null; heldOpen = true; document.body.classList.remove("ui"); settingsUI.open(); }, HOLD_MS);
});
document.addEventListener("pointermove", e => {
  if (holdTimer && Math.hypot(e.clientX - holdX, e.clientY - holdY) > HOLD_SLOP) cancelHold();
});
document.addEventListener("pointerup", cancelHold);     // heldOpen is cleared by the click that follows, or the next press
document.addEventListener("pointercancel", cancelHold);
document.addEventListener("contextmenu", e => e.preventDefault());

/* ---------- show/hide controls on tap ---------- */
let uiTimer;
function showUI() {
  document.body.classList.add("ui");
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!settingsUI.isOpen()) document.body.classList.remove("ui"); }, 4000);
}
document.addEventListener("click", e => {
  if (modes.justSwiped()) return;                       // that was a swipe, not a tap
  if (heldOpen) { heldOpen = false; return; }           // the click that ends a press-and-hold: keep Settings open
  if (settingsUI.isOpen() && !e.target.closest("#sheet")) { settingsUI.close(); return; }
  showUI();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { settingsUI.close(); closeConnect(); library.close(); }
  if (e.target.closest("input, select, textarea, .bar")) return;
  if (e.key === "ArrowRight") modes.step(1);
  if (e.key === "ArrowLeft") modes.step(-1);
  if (e.key === "ArrowDown") engine.next();
  if (e.key === "ArrowUp") engine.prev();
  if (e.key === " " && isConnected() && !e.target.closest("button")) { e.preventDefault(); playback.togglePlay(); }
});

/* ---------- keep the screen on (Settings › Display › Keep screen on) ----------
   iOS only grants the wake lock after a tap, and drops it when the app is hidden, so we ask again on every tap and
   when the app comes back. If it can't be had, a toast says so once (instead of the old status line). */
let wake = null, wakeWarned = false;
// The screen stays on when the switch is on, and ALSO while a sleep timer runs (a locked iPad freezes Encore, so the
// timer could never stop the music). After the sleep screen comes on, nothing holds it: the iPad locks by itself.
const wakeWanted = () => !asleep && (settings.wakeOn || sleep.active());
async function requestWake() {
  if (!wakeWanted() || wake) return;
  if (!("wakeLock" in navigator)) {
    if (!wakeWarned) { wakeWarned = true; toast("This browser can't keep the screen on. Set Auto-Lock to Never instead."); }
    return;
  }
  try {
    wake = await navigator.wakeLock.request("screen");
    wake.addEventListener("release", () => { wake = null; });
    if (!wakeWanted()) releaseWake();                    // switched off while the request was on its way
  } catch {
    // Normal before the first tap after opening; only worth a message when a tap didn't help either.
    if (navigator.userActivation && navigator.userActivation.isActive && !wakeWarned) {
      wakeWarned = true; toast("The iPad didn't allow Encore to keep the screen on.");
    }
  }
}
function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }
document.addEventListener("pointerdown", requestWake);

/* ---------- sleep timer (decisions Q1–Q8) ----------
   Started from the moon button in the Spotify screen. At the end the music has already faded and paused
   (js/sleep.js); here the screen goes black, Encore stops working in the background and lets go of the screen.
   A tap brings it back; the music stays paused. */
let asleep = false;
const sleep = createSleepTimer({
  // queueMicrotask: onChange can fire while createSleepTimer is still running, before `sleep` exists.
  onChange: () => queueMicrotask(() => { sleepButton.render(); if (wakeWanted()) requestWake(); else releaseWake(); }),
  onSleep() {
    asleep = true;
    library.close(); settingsUI.close();
    $("sleepScreen").classList.add("on");
    releaseWake(); engine.stop(); playback.stop();
    tellNightstand();                                    // Nightstand lets go of the screen too
  },
});
const sleepButton = createSleepButton(sleep);
function wakeUp(e) {
  e.preventDefault(); e.stopPropagation();
  if (!asleep) return;
  asleep = false;
  $("sleepScreen").classList.remove("on");
  tickClock(); requestWake(); if (!nsUp()) engine.start();
  tellNightstand();
  if (isConnected()) playback.start();
}
$("sleepScreen").addEventListener("click", wakeUp);

/* ---------- pause work while hidden (saves battery, avoids wasted requests) ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tickClock();
    if (asleep) return;                                  // stays black until you tap
    requestWake(); if (!nsUp()) engine.start();
    layout.apply();   // the iPad may have rotated while the app was in the background: re-fit the widget
    applyNight();                                        // time has passed: night may have begun or ended
    if (isConnected()) playback.start();
  } else {
    engine.stop(); playback.stop();
  }
});

/* ---------- Home Screen icon (drawn once, used by Add to Home Screen) ---------- */
function makeTouchIcon() {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 180;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 180, 180);
    grad.addColorStop(0, "#2f3a33"); grad.addColorStop(1, "#07080a");
    g.fillStyle = grad; g.fillRect(0, 0, 180, 180);
    g.fillStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.roundRect(84, 26, 74, 50, 12); g.fill();
    g.fillStyle = "#f5f5f7"; g.beginPath(); g.moveTo(112, 40); g.lineTo(112, 62); g.lineTo(130, 51); g.closePath(); g.fill();
    const link = document.createElement("link");
    link.rel = "apple-touch-icon"; link.href = c.toDataURL("image/png");
    document.head.append(link);
  } catch {}
}

/* ---------- Nightstand sheet ----------
   Nightstand is an iframe (nightstand/?embed=1) loaded at start and kept on top of Encore. Swipe UP here → it slides up
   from the bottom (CSS :root.ns-up); swipe DOWN in Nightstand → it posts {type:"nightstand", close:true} and slides
   back down. Encore keeps running underneath, but its wallpaper
   slideshow rests while covered, and Nightstand rests its clock and slideshow while it is down ({shown}).
   standby.app remembers which one was up, so the Home Screen icon reopens it (route.js). */
const nsFrame = $("nsFrame");
const nsUp = () => document.documentElement.classList.contains("ns-up");
function tellNightstand() {
  try { nsFrame.contentWindow.postMessage({ type: "encore", shown: nsUp(), asleep }, location.origin); } catch {}
}
function setNightstand(up) {
  const root = document.documentElement;
  root.classList.toggle("ns-up", up);
  ls.set("standby.app", up ? "nightstand" : "encore");
  nsFrame.setAttribute("aria-hidden", String(!up));
  // Encore can't be tapped or typed into while covered: everything except the sheet and the sleep screen is inert.
  for (const el of document.body.children) if (el !== nsFrame && el.id !== "sleepScreen" && el.tagName !== "SCRIPT") el.inert = up;
  tellNightstand();
  if (up) {
    document.body.classList.remove("ui");
    engine.stop();
    try { nsFrame.contentWindow.focus(); } catch {}       // keys go to Nightstand
  } else {
    if (!asleep && !document.hidden) engine.start();
    nsFrame.blur(); window.focus();
  }
}
function goNightstand() { setNightstand(true); }
window.addEventListener("message", e => {
  if (e.source !== nsFrame.contentWindow || e.origin !== location.origin) return;
  if (!e.data || e.data.type !== "nightstand") return;
  if (e.data.close && nsUp()) setNightstand(false);
  // Keep screen on is one shared setting (encore.settings.wakeOn): Nightstand changed it, so adopt it here too,
  // or Encore's next save would write its stale value back.
  if (typeof e.data.wakeOn === "boolean") {
    settings.wakeOn = e.data.wakeOn;
    save();
    if (wakeWanted()) requestWake(); else releaseWake();
    settingsUI.refresh();
  }
});
nsFrame.addEventListener("load", tellNightstand);         // it may load after start() ran

/* ---------- start ---------- */
/* ---------- every minute: night mode ---------- */
setInterval(() => { if (!document.hidden) applyNight(); }, 60000);

(async function start() {
  applyNight();
  applyAccent();
  modes.set(settings.mode, "auto");
  layout.apply();
  tickClock();
  makeTouchIcon();
  if (nsUp()) setNightstand(true);       // reopened on Nightstand (route.js): the sheet is already up
  else ls.set("standby.app", "encore");
  requestWake();
  const id = clientId();
  const result = await handleRedirect(id);   // always runs, so a ?code= never lingers in the address bar
  if (result && result.error) { setConnected(false); openConnect(result.error); }
  else if (isConnected() && id) { setConnected(true); if (result && result.ok) toast("Spotify connected"); }
  else setConnected(false);

  await syncCollection(true);   // your active collection
  if (!nsUp()) engine.start();
  updateEmpty();
})();
