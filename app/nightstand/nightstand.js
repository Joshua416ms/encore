(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  // Inside Encore (an iframe at nightstand/?embed=1, Encore's main.js › Nightstand sheet), or on its own (old bookmarks).
  // Embedded, Encore tells us when the sheet is up ({type:"encore", shown, asleep}); while it's down we rest.
  const embedded = window.parent !== window && new URLSearchParams(location.search).has("embed");
  let shown = !embedded;

  /* ---------- settings ---------- */
  const ACCENTS = [
    ["Amber", "#ffb454"], ["Coral", "#ff7a59"], ["Sky", "#6cc4ff"],
    ["Lilac", "#b9a4ff"], ["Sage", "#9fd3a8"], ["Paper", "#f3eee6"]
  ];
  const DEFAULTS = { h24:false, accent:"#ffb454", units: /^en-US/i.test(navigator.language || "") ? "F" : "C", loc: null };
  const REMOVED = ["sec", "monday", "night", "from", "to", "interval"];   // settings that no longer exist
  let S = { ...DEFAULTS };
  try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("nightstand") || "{}") }; } catch (e) {}
  const save = () => { try { localStorage.setItem("nightstand", JSON.stringify(S)); } catch (e) {} };
  if (REMOVED.some(k => k in S)) { REMOVED.forEach(k => delete S[k]); save(); }
  // The photo page is gone: free the photos it kept on this device.
  try { indexedDB.deleteDatabase("nightstand"); } catch (e) {}

  const sw = $("swatches"), units = [...$("setUnits").children];
  ACCENTS.forEach(([name, hex], i) => {
    sw.insertAdjacentHTML("beforeend",
      `<input type="radio" name="accent" id="ac${i}" value="${hex}"><label for="ac${i}" title="${name}" aria-label="${name}"></label>`);
    sw.lastElementChild.style.background = hex;       // CSSOM, not a style="" attribute (CSP)
  });

  function applySettings() {
    $("set24").checked = S.h24;
    const r = sw.querySelector(`input[value="${S.accent}"]`); if (r) r.checked = true;
    root.style.setProperty("--user-accent", S.accent);
    units.forEach(b => b.setAttribute("aria-checked", String(b.dataset.v === S.units)));
    $("locLabel").textContent = S.loc ? S.loc.name : "Not set";
    lastDay = -1; tick(); renderWeather();
  }
  $("set24").onchange = e => { S.h24 = e.target.checked; save(); applySettings(); };
  sw.onchange = e => { S.accent = e.target.value; save(); applySettings(); };

  /* ---------- clock ---------- */
  const pad = n => String(n).padStart(2, "0");
  function timeParts(d) {
    let h = d.getHours(), ap = "";
    if (!S.h24) { ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; }
    return { h: S.h24 ? pad(h) : String(h), m: pad(d.getMinutes()), ap };
  }

  // analog ticks + numerals
  const ticks = $("ticks");
  let tk = "";
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0, a = i * 6 * Math.PI / 180;
    const r1 = major ? 80 : 86, r2 = 92;
    tk += `<line class="tick${major ? " major" : ""}" stroke-width="${major ? 3 : 1.2}" x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${100 - r2 * Math.cos(a)}"></line>`;
  }
  [[12, 0], [3, 90], [6, 180], [9, 270]].forEach(([n, deg]) => {
    const a = deg * Math.PI / 180;
    tk += `<text x="${100 + 64 * Math.sin(a)}" y="${100 - 64 * Math.cos(a)}">${n}</text>`;
  });
  ticks.innerHTML = tk;

  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }
  function renderCalendar(d) {
    const y = d.getFullYear(), m = d.getMonth(), today = d.getDate();
    $("calMonth").textContent = d.toLocaleDateString(undefined, { month: "long" });
    $("calYear").textContent = y;
    const names = ["S","M","T","W","T","F","S"];
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = names.map(n => `<span class="wd">${n}</span>`).join("");
    for (let i = 0; i < first; i++) html += "<span></span>";
    for (let i = 1; i <= days; i++) {
      const col = (first + i - 1) % 7, weekend = col === 0 || col === 6;
      html += `<span class="${i === today ? "today" : weekend ? "wk" : ""}">${i}</span>`;
    }
    $("calGrid").innerHTML = html;
    const doy = Math.round((new Date(y, m, today) - new Date(y, 0, 0)) / 864e5);
    const total = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    $("calFoot").innerHTML = `Day <b>${doy}</b> of ${total} &middot; Week <b>${isoWeek(d)}</b>`;
  }

  let lastDay = -1, lastMin = -1;
  function tick() {
    const d = new Date(), s = d.getSeconds(), { h, m, ap } = timeParts(d);
    const dateStr = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    $("bigH").textContent = h; $("bigM").textContent = m; $("bigAP").textContent = ap;
    $("bigDate").textContent = dateStr;

    const hr = d.getHours() % 12, mn = d.getMinutes();
    $("hh").setAttribute("transform", `rotate(${(hr + mn / 60) * 30} 100 100)`);
    $("mh").setAttribute("transform", `rotate(${(mn + s / 60) * 6} 100 100)`);
    $("sh").setAttribute("transform", `rotate(${s * 6} 100 100)`);

    if (d.getDate() !== lastDay) { lastDay = d.getDate(); renderCalendar(d); }
    if (mn !== lastMin) { lastMin = mn; antiBurnIn(); }
  }
  // Nudge content a few pixels every minute so nothing sits in one spot all night.
  function antiBurnIn() {
    const r = () => Math.round((Math.random() * 2 - 1) * 8);
    ["bigWrap", "wxWrap", "calWrap"].forEach(id => { $(id).style.transform = `translate(${r()}px,${r()}px)`; });
  }
  // While the sheet is down, only once a minute (time, date and calendar stay right, so it lands complete).
  function loop() { if (shown || new Date().getSeconds() === 0) tick(); setTimeout(loop, 1000 - (Date.now() % 1000) + 5); }

  /* ---------- pager dots + tap-to-show controls ---------- */
  const pager = $("pager"), dots = [...$("dots").children];
  pager.addEventListener("scroll", () => {
    const i = Math.round(pager.scrollLeft / pager.clientWidth);
    dots.forEach((dt, k) => dt.classList.toggle("on", k === i));
    try { localStorage.setItem("nightstand-page", i); } catch (e) {}
    showUI();
  }, { passive: true });
  let uiTimer;
  function showUI() {
    document.body.classList.add("ui");
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => { if (!$("sheet").classList.contains("open")) document.body.classList.remove("ui"); }, 4000);
  }
  pager.addEventListener("click", () => { if ($("sheet").classList.contains("open")) closeSheet(); else showUI(); });
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") pager.scrollBy({ left: pager.clientWidth, behavior: "smooth" });
    if (e.key === "ArrowLeft") pager.scrollBy({ left: -pager.clientWidth, behavior: "smooth" });
    if (e.key === "Escape") closeSheet();
  });
  const openSheet = () => { $("sheet").classList.add("open"); showUI(); };
  function closeSheet() { $("sheet").classList.remove("open"); showUI(); }
  $("gearBtn").onclick = e => { e.stopPropagation(); openSheet(); };
  $("closeBtn").onclick = closeSheet;

  // Full screen (desktop browsers; a Home Screen app is already full screen)
  const fsEl = document.documentElement;
  const canFS = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
  if (canFS && !navigator.standalone) {
    $("fsBtn").hidden = false;
    $("fsBtn").onclick = async e => {
      e.stopPropagation();
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else await canFS.call(fsEl);
      } catch (err) { $("fsBtn").hidden = true; }
      requestWake();
    };
  }

  /* ---------- keep screen awake ----------
     Follows the shared Keep screen on switch (encore.settings.wakeOn; in both apps' Settings), and also stays on while Encore's sleep
     timer runs: a locked iPad freezes this page, so the timer could not stop the music. */
  let wake = null, asleep = false, sleepTimer = null;
  const wakeSwitchOn = () => { try { return JSON.parse(localStorage.getItem("encore.settings") || "{}").wakeOn !== false; } catch (e) { return true; } };
  const timerOn = () => embedded
    ? Number(localStorage.getItem("encore.sleepAt")) > Date.now()   // Encore runs the timer; we only read it
    : !!(sleepTimer && sleepTimer.active());
  const wakeWanted = () => shown && !asleep && (wakeSwitchOn() || timerOn());
  function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }
  async function requestWake() {
    $("setWake").checked = wakeSwitchOn();
    if (!wakeWanted()) { releaseWake(); return; }
    if (wake || !("wakeLock" in navigator)) return;
    try {
      wake = await navigator.wakeLock.request("screen");
      if (!wakeWanted()) { releaseWake(); return; }
      wake.addEventListener("release", () => { wake = null; });
    } catch (e) { /* needs a tap first; the next pointerdown tries again */ }
  }
  // One shared setting with Encore (encore.settings.wakeOn): write it there, keep Encore's other keys, and tell Encore.
  $("setWake").onchange = e => {
    const on = e.target.checked;
    try {
      const es = JSON.parse(localStorage.getItem("encore.settings") || "{}");
      es.wakeOn = on; localStorage.setItem("encore.settings", JSON.stringify(es));
    } catch (err) {}
    if (embedded) parent.postMessage({ type: "nightstand", wakeOn: on }, location.origin);
    requestWake();
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { if (!asleep) requestWake(); tick(); } });

  /* ---------- sleep timer (started in Encore's Spotify screen; shared code in ../js/sleep.js) ----------
     The timer keeps running here. When it ends, the music has already faded and paused; the screen goes black and
     Nightstand lets go of the screen so the iPad locks. A tap brings Nightstand back. */
  // Embedded, Encore runs the one timer and shows its own sleep screen over the sheet; it tells us via {asleep}.
  if (!embedded) import("../js/sleep.js").then(m => {
    sleepTimer = m.createSleepTimer({
      onChange: () => requestWake(),
      onSleep() { asleep = true; closeSheet(); $("sleepScreen").classList.add("on"); releaseWake(); },
    });
    requestWake();
  }).catch(() => { /* no Spotify module (e.g. opened from a file): the timer just isn't available here */ });
  $("sleepScreen").addEventListener("click", e => {
    e.stopPropagation();
    asleep = false;
    $("sleepScreen").classList.remove("on");
    requestWake(); tick();
  });
  document.addEventListener("pointerdown", requestWake);

  /* ---------- weather (Open-Meteo, no key needed) ---------- */
  const RAYS = [0,45,90,135,180,225,270,315].map(a => `<line x1="24" y1="10" x2="24" y2="6" transform="rotate(${a} 24 24)"/>`).join("");
  const SUN = `<g class="s"><circle cx="24" cy="24" r="8"/>${RAYS}</g>`;
  const MOON = `<path class="s" d="M29 9a14 14 0 1 0 10 21A12 12 0 0 1 29 9z"/>`;
  const CLOUD = (dy = 0) => `<path class="c" transform="translate(0 ${dy})" d="M15 38h19a8 8 0 0 0 1-15.9A11 11 0 0 0 14 21a8.5 8.5 0 0 0 1 17z"/>`;
  function wxKind(c) {
    if (c === 0) return "clear"; if (c === 1) return "mostly"; if (c === 2) return "partly"; if (c === 3) return "cloudy";
    if (c === 45 || c === 48) return "fog"; if (c >= 51 && c <= 57) return "drizzle";
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow"; if (c >= 95) return "storm";
    return "cloudy";
  }
  const WX_TEXT = { clear:"Clear", mostly:"Mostly clear", partly:"Partly cloudy", cloudy:"Cloudy", fog:"Fog", drizzle:"Drizzle", rain:"Rain", snow:"Snow", storm:"Thunderstorms" };
  function wxIcon(code, day) {
    const k = wxKind(code), orb = day ? SUN : MOON;
    let g;
    if (k === "clear") g = orb;
    else if (k === "mostly" || k === "partly") g = `<g transform="translate(1 1) scale(.72)">${orb}</g>${CLOUD(3)}`;
    else if (k === "cloudy") g = CLOUD(0);
    else if (k === "fog") g = `<path class="p" d="M9 18h30M6 25h36M10 32h28"/>`;
    else if (k === "drizzle") g = CLOUD(-6) + `<path class="p" d="M18 37l-1 3M25 37l-1 3M32 37l-1 3"/>`;
    else if (k === "rain") g = CLOUD(-6) + `<path class="p" d="M18 36l-2 6M25 36l-2 6M32 36l-2 6"/>`;
    else if (k === "snow") g = CLOUD(-6) + `<circle class="f" cx="17" cy="39" r="1.8"/><circle class="f" cx="24" cy="43" r="1.8"/><circle class="f" cx="31" cy="39" r="1.8"/>`;
    else g = CLOUD(-6) + `<path class="s" d="M26 33l-5 7h6l-4 7"/>`;
    return `<svg class="wxi" viewBox="0 0 48 48" aria-hidden="true">${g}</svg>`;
  }
  const SAMPLE = {
    place: "Example city", unit: "F", fetched: 0,
    current: { temp: 54, feels: 51, code: 2, day: 1, wind: 7, hum: 62 },
    hours: [[16,53,2,1,0],[17,51,3,0,10],[18,49,3,0,20],[19,47,61,0,60],[20,46,61,0,70],[21,45,3,0,30]]
      .map(([h, temp, code, day, pop]) => ({ h, temp, code, day, pop })),
    days: [["Today",2,41,58,10],["Thu",61,44,55,80],["Fri",3,40,52,20],["Sat",0,37,56,0],["Sun",1,42,61,0]]
      .map(([name, code, lo, hi, pop]) => ({ name, code, lo, hi, pop })),
    sunrise: "06:52", sunset: "16:41"
  };
  let WX = null, wxState = "idle";
  try { const c = JSON.parse(localStorage.getItem("nightstand-wx") || "null"); if (c && c.current) WX = c; } catch (e) {}

  const T = (v, from) => { let x = v; if (from !== S.units) x = S.units === "C" ? (v - 32) * 5 / 9 : v * 9 / 5 + 32; return Math.round(x) + "°"; };
  const hourLabel = h => S.h24 ? pad(h) + ":00" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  const clockLabel = hm => { const [h, m] = hm.split(":").map(Number); return S.h24 ? `${pad(h)}:${pad(m)}` : `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };

  function renderWeather() {
    const ex = !WX, d = WX || SAMPLE, u = d.unit, c = d.current;
    $("wxPill").hidden = !ex;
    $("wxSet").hidden = !!S.loc;
    $("wxPlace").textContent = ex ? (S.loc ? S.loc.name : "Example city") : d.place;
    $("wxTemp").textContent = T(c.temp, u);
    $("wxIcon").innerHTML = wxIcon(c.code, c.day);
    const k = wxKind(c.code);
    $("wxCond").textContent = k === "clear" && c.day ? "Sunny" : WX_TEXT[k];
    const today = d.days[0];
    const nowHM = pad(new Date().getHours()) + ":" + pad(new Date().getMinutes());
    const sunEvent = nowHM < d.sunrise || nowHM >= d.sunset ? ["Sunrise", d.sunrise] : ["Sunset", d.sunset];
    $("wxMeta").innerHTML =
      `<span>H <b>${T(today.hi, u)}</b> L <b>${T(today.lo, u)}</b></span>` +
      `<span>Feels like <b>${T(c.feels, u)}</b></span>` +
      `<span>Wind <b>${Math.round(c.wind)} ${u === "F" ? "mph" : "km/h"}</b></span>` +
      `<span>${sunEvent[0]} <b>${clockLabel(sunEvent[1])}</b></span>`;
    $("wxHours").innerHTML = d.hours.map(h =>
      `<div class="wx-h"><span class="t">${hourLabel(h.h)}</span>${wxIcon(h.code, h.day)}<span class="v">${T(h.temp, u)}</span><span class="pop">${h.pop >= 20 ? h.pop + "%" : ""}</span></div>`).join("");
    const lo = Math.min(...d.days.map(x => x.lo)), hi = Math.max(...d.days.map(x => x.hi)), span = Math.max(1, hi - lo);
    $("wxDays").innerHTML = d.days.map(x =>
      `<div class="wx-d"><span>${x.name}</span>${wxIcon(x.code, 1)}<span class="lo">${T(x.lo, u)}</span>` +
      `<span class="range"><i></i></span><span>${T(x.hi, u)}</span></div>`).join("");
    [...$("wxDays").querySelectorAll(".range i")].forEach((bar, k) => {   // CSSOM, not style="" (CSP)
      bar.style.left = (d.days[k].lo - lo) / span * 100 + "%"; bar.style.right = (hi - d.days[k].hi) / span * 100 + "%";
    });

    let foot;
    if (!S.loc) foot = "Showing an example forecast. Choose your city in Settings to see yours.";
    else if (ex && wxState === "loading") foot = "Loading your forecast…";
    else if (ex) foot = "Couldn't load the forecast. Live weather can't load inside claude.ai; it works once Nightstand has its own web address.";
    else {
      const t = new Date(d.fetched), when = S.h24 ? `${pad(t.getHours())}:${pad(t.getMinutes())}` : t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      foot = wxState === "error" ? `Offline. Last updated ${when}.` : `Updated ${when} from Open-Meteo`;
    }
    $("wxFoot").textContent = foot;
  }

  // Weather values are inserted into the page as HTML, so force them to be plain numbers / "HH:MM".
  // If the service ever returned unexpected text, it can't turn into markup or script.
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const hhmm = v => { const m = /T(\d{2}:\d{2})/.exec(String(v)); return m ? m[1] : "00:00"; };

  async function fetchWeather() {
    if (!S.loc) { renderWeather(); return; }
    wxState = "loading"; renderWeather();
    const units = S.units === "F" ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "";
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${S.loc.lat}&longitude=${S.loc.lon}` +
      `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m` +
      `&hourly=temperature_2m,weather_code,precipitation_probability,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
      `&timezone=auto&forecast_days=6${units}`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), cur = j.current, H = j.hourly, D = j.daily;
      let i = H.time.findIndex(t => t.slice(0, 13) === cur.time.slice(0, 13));
      if (i < 0) i = 0;
      const hours = [];
      for (let k = i + 1; k < Math.min(H.time.length, i + 7); k++)
        hours.push({ h: num(H.time[k].slice(11, 13)), temp: num(H.temperature_2m[k]), code: num(H.weather_code[k]), day: num(H.is_day[k]), pop: num(H.precipitation_probability[k]) });
      const days = D.time.slice(0, 5).map((t, k) => ({
        name: k === 0 ? "Today" : new Date(t + "T12:00").toLocaleDateString(undefined, { weekday: "short" }),
        code: num(D.weather_code[k]), lo: num(D.temperature_2m_min[k]), hi: num(D.temperature_2m_max[k]), pop: num(D.precipitation_probability_max[k])
      }));
      WX = {
        place: S.loc.name, unit: S.units, fetched: Date.now(),
        current: { temp: num(cur.temperature_2m), feels: num(cur.apparent_temperature), code: num(cur.weather_code), day: num(cur.is_day), wind: num(cur.wind_speed_10m), hum: num(cur.relative_humidity_2m) },
        hours, days, sunrise: hhmm(D.sunrise[0]), sunset: hhmm(D.sunset[0])
      };
      wxState = "idle";
      try { localStorage.setItem("nightstand-wx", JSON.stringify(WX)); } catch (e) {}
    } catch (e) { wxState = "error"; }
    renderWeather();
  }

  function setLocation(loc) {
    S.loc = loc; save(); WX = null;
    try { localStorage.removeItem("nightstand-wx"); } catch (e) {}
    $("locResults").innerHTML = ""; $("locInput").value = "";
    applySettings(); fetchWeather();
  }
  $("locForm").addEventListener("submit", async e => {
    e.preventDefault();
    const q = $("locInput").value.trim(); if (!q) return;
    const box = $("locResults"); box.textContent = "Searching…";
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.results || !j.results.length) { box.textContent = `No places found for "${q}". Try a nearby larger city.`; return; }
      box.innerHTML = "";
      j.results.forEach(p => {
        const b = document.createElement("button"); b.type = "button";
        const region = [p.admin1, p.country].filter(Boolean).join(", ");
        b.append(p.name + " "); const sp = document.createElement("span"); sp.textContent = region; b.append(sp);
        b.onclick = () => setLocation({ lat: p.latitude, lon: p.longitude, name: p.admin1 ? `${p.name}, ${p.admin1}` : p.name });
        box.append(b);
      });
    } catch (err) {
      box.textContent = "Couldn't search right now. Search only works once Nightstand has its own web address, not inside claude.ai.";
    }
  });
  $("locHere").onclick = () => {
    const box = $("locResults");
    if (!navigator.geolocation) { box.textContent = "This browser can't share your location. Search for your city instead."; return; }
    box.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      p => setLocation({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), name: "Current location" }),
      () => { box.textContent = "Location isn't available here. Search for your city instead."; },
      { timeout: 10000, maximumAge: 3600000 });
  };
  units.forEach(b => b.onclick = () => { if (S.units === b.dataset.v) return; S.units = b.dataset.v; save(); applySettings(); fetchWeather(); });
  $("wxSet").onclick = e => { e.stopPropagation(); openSheet(); setTimeout(() => $("locInput").focus(), 350); };
  setInterval(fetchWeather, 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!WX || Date.now() - WX.fetched > 15 * 60 * 1000)) fetchWeather();
  });

  /* ---------- switching between Nightstand and Encore ----------
     Swipe DOWN anywhere (not in Settings, not starting at the top/bottom edge where iPadOS has its own gestures)
     goes back to Encore. In Encore, swiping UP comes here. The Home Screen icon reopens whichever app was used last. */
  // Embedded, Encore owns standby.app and slides the sheet away when we ask; on its own, go to Encore's page.
  if (!embedded) try { localStorage.setItem("standby.app", "nightstand"); } catch (e) {}
  function toEncore() {
    if (embedded) { parent.postMessage({ type: "nightstand", close: true }, location.origin); return; }
    try { localStorage.setItem("standby.app", "encore"); } catch (e) {}
    location.assign("../");
  }
  if (embedded) window.addEventListener("message", e => {
    if (e.source !== parent || e.origin !== location.origin || !e.data || e.data.type !== "encore") return;
    const wasShown = shown;
    shown = !!e.data.shown; asleep = !!e.data.asleep;
    if (shown && !wasShown) {
      tick();                                               // catch up at once
    }
    if (!shown) { closeSheet(); document.body.classList.remove("ui"); }
    requestWake();
  });
  let vs = null;
  function vStart(x, y, target) {
    const edge = y < 56 || y > window.innerHeight - 56;
    vs = edge || asleep || target.closest("#sheet, input, select, textarea") ? null : { x, y, t: Date.now() };
  }
  function vEnd(x, y) {
    if (!vs) return;
    const dx = x - vs.x, dy = y - vs.y, quick = Date.now() - vs.t < 700;
    vs = null;
    if (quick && dy > 60 && dy > Math.abs(dx) * 1.5) toEncore();
  }
  // Touch events (not pointer events): the horizontal pager scrolls natively, which cancels pointer events.
  document.addEventListener("touchstart", e => { if (e.touches.length === 1) { const t = e.touches[0]; vStart(t.clientX, t.clientY, e.target); } else vs = null; }, { passive: true });
  document.addEventListener("touchend", e => { const t = e.changedTouches[0]; if (t) vEnd(t.clientX, t.clientY); }, { passive: true });
  document.addEventListener("mousedown", e => vStart(e.clientX, e.clientY, e.target));
  document.addEventListener("mouseup", e => vEnd(e.clientX, e.clientY));

  /* ---------- start ---------- */
  applySettings();
  fetchWeather();
  loop();
  requestWake();
  try {
    const p = Math.min(2, Math.max(0, +localStorage.getItem("nightstand-page") || 0));
    if (p > 0) requestAnimationFrame(() => pager.scrollTo({ left: pager.clientWidth * p }));
  } catch (e) {}
  window.addEventListener("resize", () => {
    const i = dots.findIndex(dt => dt.classList.contains("on"));
    pager.scrollTo({ left: pager.clientWidth * Math.max(0, i) });
  });
})();
