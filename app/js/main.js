// Entry point: creates each component and connects them with small callbacks.
//
//   wallpapers/engine ──onShow(info)──▶ main ──▶ layout.setWallpaperInfo (widget gets darker over bright photos)
//                                            └─▶ photos.markCurrent     (highlights the thumbnail)
//   ui/settings ──onChange(key)──▶ main ──▶ layout.apply / engine.reschedule / clock
//   spotify/playback ──onChange(state)──▶ main ──▶ nowPlaying.render (the widget's contents)
//
// Components never reach into each other directly, so each can be changed or replaced on its own.
import { SPOTIFY_CLIENT_ID } from "./config.js";
import { redirectUri, beginLogin, handleRedirect, isConnected, logout, canSignIn } from "./spotify/auth.js";
import { createClient } from "./spotify/client.js";
import { createPlayback } from "./spotify/playback.js";
import { createNowPlaying } from "./ui/nowplaying.js";
import { createSettings, DEFAULTS } from "./ui/settings.js";
import { createLayout } from "./ui/layout.js";
import { createPhotos } from "./ui/photos.js";
import { createWallpaperEngine } from "./wallpapers/engine.js";
import { createModes } from "./ui/modes.js";
import { createArtMode } from "./ui/artmode.js";

const $ = id => document.getElementById(id);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- settings (persisted in localStorage as one JSON object) ---------- */
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(ls.get("encore.settings") || "{}")); } catch {}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ls.set("encore.settings", JSON.stringify(settings)), 150); };
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
const photos = createPhotos({ settings, save, engine, toast, onCollectionChange: updateEmpty });

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
  if (settingsUI.isOpen()) settingsUI.sync();
});
const artMode = createArtMode();
const nowPlaying = createNowPlaying(playback, { onTrack: t => artMode.update(t, true) });

const modes = createModes({
  settings, save,
  isDragging: () => layout.isDragging(),
  onModeChange() { document.body.classList.remove("ui"); },
});

const WALL_KEYS = ["wallInterval", "wallPaused", "wallOrder"];
const settingsUI = createSettings({
  settings, client, playback, redirect: redirectUri(), clientId, isConnected, toast,
  onChange(key) {
    save();
    layout.apply();
    if (key === "h24") tickClock();
    if (WALL_KEYS.includes(key)) engine.reschedule();
  },
  onTab(name) { if (name === "photos") photos.render(); else photos.release(); },
  onConnect: () => openConnect(),
  onDisconnect() { logout(); playback.stop(); nowPlaying.setPremiumBlocked(false); setConnected(false); },
});

/* ---------- Spotify connection state ---------- */
function setConnected(on) {
  $("widget").classList.toggle("disconnected", !on);
  $("widgetConnect").hidden = on;
  if (!on) artMode.update(null, false);
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
$("copyRedirect2").onclick = () => copyRedirect($("redirectUri2"));

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
$("openPhotos").addEventListener("click", e => { e.stopPropagation(); settingsUI.open("photos"); });

/* ---------- photo navigation: ‹ › buttons (after a tap) and the ↑ ↓ keys. Swipes change display modes. ---------- */
$("wpPrev").addEventListener("click", e => { e.stopPropagation(); engine.prev(); showUI(); });
$("wpNext").addEventListener("click", e => { e.stopPropagation(); engine.next(); showUI(); });

/* ---------- show/hide controls on tap ---------- */
let uiTimer;
function showUI() {
  document.body.classList.add("ui");
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!settingsUI.isOpen()) document.body.classList.remove("ui"); }, 4000);
}
document.addEventListener("click", e => {
  if (modes.justSwiped()) return;                       // that was a swipe, not a tap
  if (settingsUI.isOpen() && !e.target.closest("#sheet")) { settingsUI.close(); return; }
  showUI();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { settingsUI.close(); closeConnect(); }
  if (e.target.closest("input, select, textarea, #bar")) return;
  if (e.key === "ArrowRight") modes.step(1);
  if (e.key === "ArrowLeft") modes.step(-1);
  if (e.key === "ArrowDown") engine.next();
  if (e.key === "ArrowUp") engine.prev();
  if (e.key === " " && isConnected() && !e.target.closest("button")) { e.preventDefault(); playback.togglePlay(); }
});

/* ---------- keep the screen on ---------- */
let wake = null;
async function requestWake() {
  if (!("wakeLock" in navigator)) { $("wakeState").textContent = "Not supported"; return; }
  if (wake) return;
  try {
    wake = await navigator.wakeLock.request("screen");
    $("wakeState").textContent = "On";
    wake.addEventListener("release", () => { wake = null; $("wakeState").textContent = "Paused"; });
  } catch {
    $("wakeState").textContent = "Tap the screen to turn on";
  }
}
document.addEventListener("pointerdown", requestWake);

/* ---------- pause work while hidden (saves battery, avoids wasted requests) ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tickClock(); requestWake(); engine.start();
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

/* ---------- switching between Encore and Nightstand ---------- */
ls.set("standby.app", "encore");
$("toNightstand").addEventListener("click", () => ls.set("standby.app", "nightstand"));

/* ---------- start ---------- */
(async function start() {
  modes.set(settings.mode);
  layout.apply();
  tickClock();
  makeTouchIcon();
  requestWake();
  const id = clientId();
  const result = await handleRedirect(id);   // always runs, so a ?code= never lingers in the address bar
  if (result && result.error) { setConnected(false); openConnect(result.error); }
  else if (isConnected() && id) { setConnected(true); if (result && result.ok) toast("Spotify connected"); }
  else setConnected(false);

  try { await engine.setCollection(settings.wallCollection); } catch { /* storage unavailable: show the empty state */ }
  engine.start();
  updateEmpty();
})();
