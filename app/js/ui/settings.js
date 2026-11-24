// Settings sheet: one scrolling page of rounded groups (Photos · Music widget · Screen · Spotify).
// The few options left are described once in SCHEMA below; renderRows() builds a switch, slider or row of
// segmented buttons for each. Every change is written to `settings`, saved, and applied at once through onChange().
// Everything that used to be a setting but isn't any more lives in FORCED (decided 2026-11-23: "way too many settings").
const $ = id => document.getElementById(id);

export const DEFAULTS = {
  // Display mode (swipe or dots): "photos" | "artwork" | "player" | "lyrics" | "clock"
  mode: "photos",
  // Spotify widget: wScale multiplies every size (the − / + buttons change it). Position: a corner preset
  // ("tl","tr","bl","br") or "custom" (dragged); wX/wY = fractions of the free space.
  wScale: 1, wPos: "tr", wX: 1, wY: 0,
  wOpacity: 0.38, artOn: true, artSize: 112,
  // Photos (wallSecs: seconds between photos, one of WALL_STOPS)
  wallCollection: null, wallSecs: 300, wallOrder: "random", bgDim: 0.35, kbOn: true, kbStrength: 0.05,
  // Night mode: "auto" = on a schedule (22:00–07:00), "on", "off"
  nightMode: "auto",
  // Keep the iPad awake while Encore is open (Screen Wake Lock). Nightstand's switch writes this same value.
  wakeOn: true,
};

// No longer settings: always these values. main.js writes them over whatever was saved, on every start.
export const FORCED = {
  wallFade: 2, fgSize: 0.8, bgExtend: true, bgBlur: 20, vignette: 0, wallDim: 0,
  infoOn: true, textScale: 1, albumOn: true, controlsOn: false, extrasOn: false, progressOn: false, accent: "white",
  lyricsOn: true, lyricsOffset: 0,
  clockOn: false, dateOn: false, h24: false, clockSize: 1, clockPos: "tl",
  nightFrom: "22:00", nightTo: "07:00",
  artMargin: 14, artBg: "colors",
};

// Old settings that no longer exist at all: deleted from the saved copy on start (main.js).
export const REMOVED = ["wallInterval", "wallPaused", "wallByPeriod", "autoMode", "autoPhotosAfter",
  // widget sizes removed 2026-11-19 (resizing is the − / + buttons)
  "wWidth", "wHeight", "wPad", "wBlur", "artRadius"];

// Widget sizes that are no longer settings (decided 2026-11-19): always these values.
export const FIXED = { wWidth: 400, wHeight: 0, wPad: 14, wBlur: 24, artRadius: 8 };

// "Change photo every": the slider moves through these steps (seconds).
export const WALL_STOPS = [30, 45, 60, 90, 120, 180, 240, 300];
const secs = v => (v < 60 ? `${v} s` : `${v / 60} min`);
const pct = v => `${Math.round(v * 100)}%`;

export const SCHEMA = {
  photos: [
    { key: "wallSecs", label: "Change photo every", type: "range", stops: WALL_STOPS, fmt: secs },
    { key: "wallOrder", label: "Order", type: "segmented", options: [["random", "Random"], ["sequential", "In order"]] },
    { key: "bgDim", label: "Background darkness", type: "range", min: 0, max: 0.8, step: 0.02, fmt: pct },
    { key: "kbOn", label: "Slow pan and zoom", type: "switch" },
    { key: "kbStrength", label: "Pan and zoom amount", type: "range", min: 0.02, max: 0.1, step: 0.01, fmt: pct },
  ],
  music: [
    { key: "wOpacity", label: "Background darkness", type: "range", min: 0.1, max: 0.9, step: 0.02, fmt: pct },
    { key: "artOn", label: "Show album cover", type: "switch" },
    { key: "artSize", label: "Album cover size", type: "range", min: 48, max: 420, step: 4, fmt: v => `${v} px` },
  ],
  screen: [
    { key: "wakeOn", label: "Keep screen on", type: "switch", note: "Stays awake while Encore or Nightstand is open." },
    { key: "nightMode", label: "Night mode", type: "segmented", options: [["auto", "Schedule"], ["on", "On"], ["off", "Off"]] },
  ],
};

/** Builds one row per schema item. Uses textContent/DOM APIs only (no HTML strings from data). */
function renderRows(container, list, settings, onChange) {
  container.textContent = "";
  for (const item of list) {
    const id = "set-" + item.key;
    const row = document.createElement("div");
    row.className = "row" + (item.type === "range" ? " range" : item.type === "segmented" ? " seg-row" : "");
    row.dataset.key = item.key;
    const label = document.createElement(item.type === "segmented" ? "span" : "label");
    label.className = "row-label";
    if (item.type !== "segmented") label.htmlFor = id;
    else label.id = id + "-label";
    label.textContent = item.label;
    row.append(label);
    let input;
    if (item.type === "switch") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.className = "switch";
      input.setAttribute("role", "switch");
      input.checked = !!settings[item.key];
      input.addEventListener("change", () => onChange(item.key, input.checked));
    } else if (item.type === "segmented") {
      input = document.createElement("div");
      input.className = "seg";
      input.setAttribute("role", "radiogroup");
      input.setAttribute("aria-labelledby", id + "-label");
      for (const [v, t] of item.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t;
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(settings[item.key] === v));
        b.addEventListener("click", () => {
          input.querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
          onChange(item.key, v);
        });
        input.append(b);
      }
    } else {
      // A slider. With `stops`, it moves through a fixed list of values (index 0…n-1 on the slider).
      input = document.createElement("input");
      input.type = "range";
      const value = () => (item.stops ? item.stops[Number(input.value)] : Number(input.value));
      if (item.stops) {
        input.min = 0; input.max = item.stops.length - 1; input.step = 1;
        const i = item.stops.indexOf(settings[item.key]);
        input.value = i < 0 ? item.stops.length - 1 : i;
      } else {
        input.min = item.min; input.max = item.max; input.step = item.step;
        input.value = settings[item.key];
      }
      const out = document.createElement("output");
      out.htmlFor = id;
      out.textContent = item.fmt(value());
      row.append(out);
      const fill = () => {                            // sand fill up to the thumb (WebKit has no ::-moz-range-progress)
        const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
        input.style.setProperty("--fill", p + "%");
      };
      fill();
      input.addEventListener("input", () => {        // "input" fires while dragging → live preview
        const v = value();
        out.textContent = item.fmt(v);
        fill();
        onChange(item.key, v);
      });
    }
    input.id = id;
    row.append(input);
    container.append(row);
    if (item.note) {
      const p = document.createElement("p");
      p.className = "row-note";
      p.textContent = item.note;
      container.append(p);
    }
  }
}

export function createSettings({ settings, onChange, client, isConnected, onConnect, onDisconnect, onOpen }) {
  const sheet = $("sheet");

  function renderAll() {
    renderRows($("rowsPhotos"), SCHEMA.photos, settings, onChange);
    renderRows($("rowsMusic"), SCHEMA.music, settings, onChange);
    renderRows($("rowsScreen"), SCHEMA.screen, settings, onChange);
  }

  function open() {
    renderAll();
    sync();
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    if (isConnected()) loadAccount();
    onOpen && onOpen(true);
  }
  function close() {
    if (!isOpen()) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    onOpen && onOpen(false);
  }
  const isOpen = () => sheet.classList.contains("open");

  $("gearBtn").addEventListener("click", e => { e.stopPropagation(); open(); });
  $("closeSheet").addEventListener("click", close);
  sheet.addEventListener("click", e => e.stopPropagation());

  function sync() {
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

  $("connectFromSettings").addEventListener("click", () => { close(); onConnect(); });

  $("disconnectBtn").addEventListener("click", () => {
    const b = $("disconnectBtn");
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "Disconnect"; onDisconnect(); sync(); return; }
    b.dataset.armed = "1"; b.textContent = "Tap again to disconnect";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Disconnect"; }, 4000);
  });

  // A setting changed elsewhere (Nightstand's Keep screen on): redraw the rows if the sheet is showing them.
  const refresh = () => { if (isOpen()) renderAll(); };

  return { open, close, isOpen, sync, refresh };
}
