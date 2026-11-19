// Settings sheet: four tabs (Photos, Music, Display, Account).
// Most options are described once in SCHEMA below; renderRows() builds a switch, dropdown or slider for each.
// Every change is written to `settings`, saved to localStorage, and applied immediately through onChange().
const $ = id => document.getElementById(id);

const DEVICE_ICON = {
  Computer: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8M12 17v3"/>',
  Smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  Tablet: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M11 18h2"/>',
  TV: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6"/>',
};
const SPEAKER = '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="14.5" r="3"/><circle cx="12" cy="7.5" r="1"/>';

export const DEFAULTS = {
  // Display mode (swipe or dots): "photos" | "artwork" | "clock"
  mode: "photos",
  // Spotify widget — wScale multiplies every size below (the +/− buttons change it)
  wScale: 1,
  // Widget position: a corner preset ("tl","tr","bl","br") or "custom" (dragged). wX/wY = fractions of the free space.
  wPos: "tr", wX: 1, wY: 0, wOpacity: 0.38,
  artOn: true, artSize: 112,
  infoOn: true, textScale: 1, albumOn: false,
  controlsOn: true, extrasOn: true, progressOn: true, accent: "art",     // "art" | "green" | "white"
  // Clock
  clockOn: true, dateOn: true, h24: false, clockSize: 1, clockPos: "tl",
  // Photos (wallInterval: minutes; 0 = only when I tap ‹ ›; -1 = photo of the day)
  wallCollection: null, wallByPeriod: {}, wallInterval: 10, wallOrder: "random", wallPaused: false, wallFade: 2, wallDim: 0,
  fgSize: 0.92, bgExtend: true, bgBlur: 48, bgDim: 0.35, vignette: 0.5,
  kbOn: true, kbStrength: 0.05,
  // Album art mode
  artMargin: 9, artBg: "colors",
  // Automatic screen switching
  autoMode: true, autoPhotosAfter: 3,
  // Night mode ("auto" = on a schedule)
  nightMode: "auto", nightFrom: "22:00", nightTo: "07:00",
  // Lyrics (LRCLIB, community-sourced) — off until you turn it on
  lyricsOn: false, lyricsOffset: 0,
  // Keep the iPad awake while Encore is open (Screen Wake Lock)
  wakeOn: true,
};

// Widget sizes that are no longer settings (decided 2026-11-19): always these values. Resizing is done with − / +
// (wScale). Old saved values for these keys are deleted on load (see main.js), so every iPad looks the same.
export const FIXED = { wWidth: 400, wHeight: 0, wPad: 14, wBlur: 24, artRadius: 8 };

const POS = [["tr", "Top right"], ["tl", "Top left"], ["br", "Bottom right"], ["bl", "Bottom left"]];
const px = v => `${v} px`;
const pct = v => `${Math.round(v * 100)}%`;

export const SCHEMA = {
  photos: [
    { key: "wallInterval", label: "Change photo every", type: "select", num: true,
      options: [[5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [30, "30 minutes"], [-1, "Once a day (photo of the day)"], [0, "Only when I tap ‹ ›"]] },
    { key: "wallOrder", label: "Order", type: "select", options: [["random", "Random"], ["sequential", "In order"]] },
    { key: "wallPaused", label: "Pause rotation", type: "switch" },
    { key: "wallFade", label: "Transition length", type: "range", min: 0.5, max: 6, step: 0.5, fmt: v => `${v} s` },
    { group: "Appearance" },
    { key: "fgSize", label: "Photo size (the whole photo always stays visible)", type: "range", min: 0.6, max: 1, step: 0.02, fmt: pct },
    { key: "bgExtend", label: "Blurred background around the photo", type: "switch" },
    { key: "bgBlur", label: "Background blur", type: "range", min: 10, max: 100, step: 2, fmt: px },
    { key: "bgDim", label: "Background darkness", type: "range", min: 0, max: 0.8, step: 0.02, fmt: pct },
    { key: "vignette", label: "Vignette (darker edges)", type: "range", min: 0, max: 0.9, step: 0.02, fmt: pct },
    { key: "wallDim", label: "Darken everything (photo too)", type: "range", min: 0, max: 0.6, step: 0.02, fmt: pct },
    { key: "kbOn", label: "Slow pan and zoom (never crops the photo)", type: "switch" },
    { key: "kbStrength", label: "Pan and zoom amount", type: "range", min: 0.02, max: 0.1, step: 0.01, fmt: pct },
  ],
  music: [
    { group: "Widget" },
    { key: "wScale", label: "Overall size (same as the − / + buttons)", type: "range", min: 0.8, max: 1.8, step: 0.1, fmt: pct },
    { key: "wPos", label: "Position (or press and hold the widget, then drag it)", type: "select",
      options: [...POS, ["custom", "Custom (dragged)"]] },
    { key: "wOpacity", label: "Background darkness", type: "range", min: 0.1, max: 0.9, step: 0.02, fmt: pct },
    { group: "Album artwork" },
    { key: "artOn", label: "Show artwork", type: "switch" },
    { key: "artSize", label: "Artwork size", type: "range", min: 48, max: 420, step: 4, fmt: px },
    { group: "Song info" },
    { key: "infoOn", label: "Show song info", type: "switch" },
    { key: "textScale", label: "Text size", type: "range", min: 0.8, max: 1.8, step: 0.05, fmt: pct },
    { key: "albumOn", label: "Show album name", type: "switch" },
    { group: "Controls" },
    { key: "controlsOn", label: "Playback controls", type: "switch" },
    { key: "extrasOn", label: "Shuffle and repeat buttons", type: "switch" },
    { key: "progressOn", label: "Progress bar", type: "switch" },
    { key: "accent", label: "Accent color", type: "select", options: [["art", "From the album art"], ["green", "Spotify green"], ["white", "White"]] },
    { group: "Lyrics" },
    { key: "lyricsOn", label: "Lyrics screen (swipe to it)", type: "switch" },
    { key: "lyricsOffset", label: "Lyrics timing", type: "range", min: -1, max: 1, step: 0.1, fmt: v => (v > 0 ? `+${v.toFixed(1)} s` : `${v.toFixed(1)} s`) },
    { note: "Lyrics come from LRCLIB, a free community-run database. They are not licensed by the music publishers and may be missing or wrong. Only the song's title, artist, album and length are sent to LRCLIB. Songs without lyrics show their album cover." },
  ],
  display: [
    { group: "Clock" },
    { key: "clockOn", label: "Show clock", type: "switch" },
    { key: "dateOn", label: "Show date", type: "switch" },
    { key: "h24", label: "24-hour time", type: "switch" },
    { key: "clockSize", label: "Clock size", type: "range", min: 0.6, max: 3, step: 0.1, fmt: pct },
    { key: "clockPos", label: "Clock position", type: "select", options: POS },
    { group: "Automatic screen switching" },
    { key: "autoMode", label: "Switch screens automatically", type: "switch" },
    { key: "autoPhotosAfter", label: "Back to photos after music stops", type: "range", min: 1, max: 15, step: 1, fmt: v => `${v} min` },
    { note: "Music playing → album art. Stopped for a while → photos. Night with nothing playing → clock. If you choose a screen yourself, automatic switching pauses for 30 minutes." },
    { group: "Screen" },
    { key: "wakeOn", label: "Keep screen on", type: "switch" },
    { note: "On: the iPad stays awake while Encore is open. If it still dims, set Auto-Lock to Never in Settings › Display & Brightness." },
    { group: "Night mode" },
    { key: "nightMode", label: "Night mode", type: "select", options: [["auto", "On a schedule"], ["on", "Always on"], ["off", "Off"]] },
    { key: "nightFrom", label: "Night starts", type: "time" },
    { key: "nightTo", label: "Night ends", type: "time" },
    { note: "At night: red text and clock, darker photos, smaller clock. The album cover itself is never tinted (Spotify's rules). Encore can't change the iPad's real brightness; see the tip below." },
    { group: "Album art mode" },
    { key: "artMargin", label: "Space around the cover", type: "range", min: 2, max: 18, step: 1, fmt: v => `${v}% of the short side` },
    { key: "artBg", label: "Background", type: "select", options: [["colors", "Colours from the cover"], ["black", "Black"]] },
  ],
};

/** Builds one row per schema item. Uses textContent/DOM APIs only (no HTML strings from data). */
function renderRows(container, list, settings, onChange) {
  container.textContent = "";
  let parent = container;
  for (const item of list) {
    if (item.group) {
      parent = document.createElement("div");
      parent.className = "group";
      const h = document.createElement("h3");
      h.textContent = item.group;
      parent.append(h);
      container.append(parent);
      continue;
    }
    if (item.note) {                                  // an explanation line, not a setting
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = item.note;
      parent.append(p);
      continue;
    }
    const id = "set-" + item.key;
    const row = document.createElement("div");
    row.className = "row" + (item.type === "range" ? " range" : "");
    row.dataset.key = item.key;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = item.label;
    row.append(label);
    let input;
    if (item.type === "time") {
      input = document.createElement("input");
      input.type = "time";
      input.value = settings[item.key];
      input.addEventListener("change", () => { if (/^\d{2}:\d{2}$/.test(input.value)) onChange(item.key, input.value); });
    } else if (item.type === "switch") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.className = "switch";
      input.checked = !!settings[item.key];
      input.addEventListener("change", () => onChange(item.key, input.checked));
    } else if (item.type === "select") {
      input = document.createElement("select");
      for (const [v, t] of item.options) {
        const o = document.createElement("option");
        o.value = String(v);
        o.textContent = t;
        input.append(o);
      }
      input.value = String(settings[item.key]);
      input.addEventListener("change", () => onChange(item.key, item.num ? Number(input.value) : input.value));
    } else {
      input = document.createElement("input");
      input.type = "range";
      input.min = item.min; input.max = item.max; input.step = item.step;
      input.value = settings[item.key];
      const out = document.createElement("output");
      out.htmlFor = id;
      out.textContent = item.fmt(settings[item.key]);
      row.append(out);
      input.addEventListener("input", () => {        // "input" fires while dragging → live preview
        const v = Number(input.value);
        out.textContent = item.fmt(v);
        onChange(item.key, v);
      });
    }
    input.id = id;
    row.append(input);
    parent.append(row);
  }
}

export function createSettings({ settings, onChange, client, playback, redirect, clientId, isConnected, onConnect, onDisconnect, onTab, toast }) {
  const sheet = $("sheet");
  let tab = "photos";
  try { tab = localStorage.getItem("encore.settings.tab") || "photos"; } catch {}

  // A change from the sheet: validate, store, apply.
  function change(key, value) {
    settings[key] = value;
    // Spotify policy: artwork and song info can't both be hidden while music plays.
    if ((key === "artOn" || key === "infoOn") && !settings.artOn && !settings.infoOn) {
      const other = key === "artOn" ? "infoOn" : "artOn";
      settings[other] = true;
      const el = $("set-" + other);
      if (el) el.checked = true;
      toast("Spotify requires the artwork or the song info to be shown");
    }
    onChange(key, value);
  }

  function renderAll() {
    renderRows($("rowsPhotos"), SCHEMA.photos, settings, change);
    renderRows($("rowsMusic"), SCHEMA.music, settings, change);
    renderRows($("rowsDisplay"), SCHEMA.display, settings, change);
    $("musicNote").textContent = "Tip: press and hold the widget (not its buttons) until it lifts, then drag it anywhere. " +
      "Artwork, text and widget size are independent; if the artwork leaves too little room beside it, the song info moves below the artwork.";
  }

  function showTab(name) {
    tab = name;
    try { localStorage.setItem("encore.settings.tab", name); } catch {}
    document.querySelectorAll(".tabs [role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (name === "account" && isConnected()) { loadAccount(); loadDevices(); }
    onTab && onTab(name);
  }
  document.querySelectorAll(".tabs [role=tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

  function open(name) {
    renderAll();
    sync();
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    showTab(name || tab);
  }
  function close() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
  const isOpen = () => sheet.classList.contains("open");

  $("gearBtn").addEventListener("click", e => { e.stopPropagation(); open(); });
  $("closeSheet").addEventListener("click", close);
  sheet.addEventListener("click", e => e.stopPropagation());

  function sync() {
    const pos = $("set-wPos");
    if (pos) pos.value = settings.wPos;
    $("redirectUri2").textContent = redirect;
    const id = clientId();
    $("clientIdShown").textContent = id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "—";
    const dev = playback.state && playback.state.device;
    $("acctDevice").textContent = dev ? dev.name : "No active device";
    const connected = isConnected();
    $("connectFromSettings").hidden = connected;
    $("disconnectBtn").hidden = !connected;
    if (!connected) $("acctName").textContent = "Not connected";
  }

  async function loadAccount() {
    try {
      const me = await client.me();
      $("acctName").textContent = me.display_name || me.id || "Connected";
    } catch {
      $("acctName").textContent = "Connected";
    }
  }

  let devicesLoaded = false;
  async function loadDevices() {
    const list = $("deviceList");
    if (!devicesLoaded) list.innerHTML = '<p class="hint">Looking for devices…</p>';
    try {
      const r = await client.devices();
      const devices = (r && r.devices) || [];
      devicesLoaded = true;
      if (!devices.length) {
        list.innerHTML = '<p class="hint">No devices found. Open Spotify on a phone, computer or speaker, then refresh.</p>';
        return;
      }
      list.textContent = "";
      devices.forEach(d => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "device" + (d.is_active ? " active" : "");
        b.disabled = d.is_restricted || d.is_active;
        b.innerHTML = `<svg viewBox="0 0 24 24" class="stroke">${DEVICE_ICON[d.type] || SPEAKER}</svg><span class="dn"></span><span class="dt"></span>`;
        b.querySelector(".dn").textContent = d.name;
        b.querySelector(".dt").textContent = d.is_active ? "Playing" : d.is_restricted ? "Can't control" : (d.type || "");
        b.onclick = async () => {
          const ok = await playback.transfer(d.id);
          toast(ok ? `Switched to ${d.name}` : "Couldn't switch devices");
          setTimeout(loadDevices, 1200);
        };
        list.append(b);
      });
    } catch (e) {
      list.innerHTML = '<p class="hint"></p>';
      list.firstChild.textContent = e.reason === "OFFLINE" ? "No connection. Try again when you're online." : "Couldn't load devices from Spotify.";
    }
  }
  $("refreshDevices").addEventListener("click", loadDevices);
  $("connectFromSettings").addEventListener("click", () => { close(); onConnect(); });

  $("disconnectBtn").addEventListener("click", () => {
    const b = $("disconnectBtn");
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "Disconnect Spotify"; onDisconnect(); sync(); return; }
    b.dataset.armed = "1"; b.textContent = "Tap again to disconnect";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Disconnect Spotify"; }, 4000);
  });

  return { open, close, isOpen, sync, get tab() { return tab; } };
}
