import { SPOTIFY_CLIENT_ID } from "./config.js";
import { redirectUri, beginLogin, handleRedirect, isConnected, logout, canSignIn } from "./spotify/auth.js";
import { createClient } from "./spotify/client.js";
import { createPlayback } from "./spotify/playback.js";
import { createNowPlaying } from "./ui/nowplaying.js";
import { createSettings, DEFAULTS } from "./ui/settings.js";

const $ = id => document.getElementById(id);
const root = document.documentElement;
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- settings ---------- */
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(ls.get("encore.settings") || "{}") }; } catch {}
const save = () => ls.set("encore.settings", JSON.stringify(settings));
const clientId = () => (ls.get("encore.spotify.clientId") || SPOTIFY_CLIENT_ID || "").trim();

function applySettings() {
  root.dataset.art = settings.art;
  root.classList.toggle("no-controls", !settings.controls);
  $("clock").hidden = !settings.clock;
  $("today").hidden = !settings.date;
  tickClock();
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- clock ---------- */
function tickClock() {
  const d = new Date();
  $("clock").textContent = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !settings.h24 });
  $("today").textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
setInterval(() => { if (!document.hidden) tickClock(); }, 5000);

/* ---------- copy redirect URI ---------- */
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

/* ---------- Spotify ---------- */
const client = createClient(clientId);
// onChange only fires after playback.start(), by which time nowPlaying and settingsUI exist.
const playback = createPlayback(client, (state, err) => {
  if (err && err.reason === "NOT_CONNECTED" && !isConnected()) { showConnect("Your Spotify session ended. Connect again to continue."); return; }
  nowPlaying.render(state, err);
  if (settingsUI.isOpen()) settingsUI.sync();
});
const nowPlaying = createNowPlaying(playback);
const settingsUI = createSettings({
  settings, save, apply: applySettings, client, playback, redirect: REDIRECT, clientId, toast,
  onDisconnect() { logout(); playback.stop(); nowPlaying.setPremiumBlocked(false); showConnect(); },
});

function showConnect(error) {
  playback.stop();
  $("stage").hidden = true;
  $("connect").hidden = false;
  $("clientId").value = clientId();
  const e = $("connectError");
  if (!canSignIn()) error = "Spotify sign-in needs a secure address (https://, or http://127.0.0.1 while testing). Open Encore from its proper web address.";
  e.hidden = !error; e.textContent = error || "";
}
function showPlayer() {
  $("connect").hidden = true;
  $("stage").hidden = false;
  if (!document.hidden) playback.start();
}

$("connectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("clientId").value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) {
    const err = $("connectError");
    err.hidden = false;
    err.textContent = "That doesn't look like a Client ID. It's 32 letters and numbers, shown on your app's page in the Spotify dashboard.";
    return;
  }
  ls.set("encore.spotify.clientId", id);
  $("connectBtn").disabled = true;
  try { await beginLogin(id); }
  catch { $("connectBtn").disabled = false; showConnect("Couldn't start Spotify sign-in on this browser."); }
});

/* ---------- show/hide chrome on tap ---------- */
let uiTimer;
function showUI() {
  document.body.classList.add("ui");
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!settingsUI.isOpen()) document.body.classList.remove("ui"); }, 4000);
}
document.addEventListener("click", e => {
  if (settingsUI.isOpen() && !e.target.closest("#sheet")) { settingsUI.close(); }
  showUI();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") settingsUI.close();
  if (e.key === " " && !$("stage").hidden && !e.target.closest("input,select,button,textarea,#bar")) { e.preventDefault(); playback.togglePlay(); }
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

/* ---------- pause work while hidden ---------- */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    tickClock(); requestWake();
    if (!$("stage").hidden) playback.start();
  } else {
    playback.stop();
  }
});

/* ---------- Home Screen icon (drawn once, used by Add to Home Screen) ---------- */
function makeTouchIcon() {
  try {
    const c = document.createElement("canvas"); c.width = c.height = 180;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 180, 180);
    grad.addColorStop(0, "#2a2b31"); grad.addColorStop(1, "#07080a");
    g.fillStyle = grad; g.fillRect(0, 0, 180, 180);
    g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.roundRect(34, 46, 88, 88, 14); g.fill();
    g.fillStyle = "#f5f5f7"; g.beginPath(); g.moveTo(66, 70); g.lineTo(66, 110); g.lineTo(98, 90); g.closePath(); g.fill();
    g.fillStyle = "#f5f5f7"; g.fillRect(132, 58, 4, 64); g.fillRect(142, 72, 4, 36);
    const link = document.createElement("link");
    link.rel = "apple-touch-icon"; link.href = c.toDataURL("image/png");
    document.head.append(link);
  } catch {}
}

/* ---------- switching between Encore and Nightstand ---------- */
// route.js reads "standby.app" to reopen the last-used app from the Home Screen icon.
ls.set("standby.app", "encore");
$("toNightstand").addEventListener("click", () => ls.set("standby.app", "nightstand"));

/* ---------- start ---------- */
(async function start() {
  applySettings();
  makeTouchIcon();
  requestWake();
  const id = clientId();
  const result = await handleRedirect(id); // always runs, so a ?code= never lingers in the address bar
  if (result && result.error) { showConnect(result.error); return; }
  if (isConnected() && id) { showPlayer(); if (result && result.ok) toast("Spotify connected"); }
  else showConnect();
})();
