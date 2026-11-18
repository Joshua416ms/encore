// Settings sheet: Spotify account + devices, and display options.
const $ = id => document.getElementById(id);

const DEVICE_ICON = {
  Computer: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8M12 17v3"/>',
  Smartphone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  Tablet: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M11 18h2"/>',
  TV: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6"/>',
};
const SPEAKER = '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="14.5" r="3"/><circle cx="12" cy="7.5" r="1"/>';

export const DEFAULTS = { art: "l", controls: true, clock: true, date: true, h24: false };

export function createSettings({ settings, save, apply, client, playback, redirect, clientId, onDisconnect, toast }) {
  const sheet = $("sheet");
  let devicesLoaded = false;

  function open() {
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    sync();
    loadAccount();
    loadDevices();
  }
  function close() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
  const isOpen = () => sheet.classList.contains("open");

  $("gearBtn").addEventListener("click", e => { e.stopPropagation(); open(); });
  $("closeSheet").addEventListener("click", close);
  sheet.addEventListener("click", e => e.stopPropagation());

  // Display options
  const bind = (id, key, prop = "checked") => {
    const el = $(id);
    el.addEventListener("change", () => { settings[key] = el[prop]; save(); apply(); });
  };
  bind("optArt", "art", "value");
  bind("optControls", "controls");
  bind("optClock", "clock");
  bind("optDate", "date");
  bind("opt24", "h24");

  function sync() {
    $("optArt").value = settings.art;
    $("optControls").checked = settings.controls;
    $("optClock").checked = settings.clock;
    $("optDate").checked = settings.date;
    $("opt24").checked = settings.h24;
    $("redirectUri2").textContent = redirect;
    const id = clientId();
    $("clientIdShown").textContent = id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "—";
    const dev = playback.state && playback.state.device;
    $("acctDevice").textContent = dev ? dev.name : "No active device";
  }

  async function loadAccount() {
    try {
      const me = await client.me();
      $("acctName").textContent = me.display_name || me.id || "Connected";
    } catch {
      $("acctName").textContent = "Connected";
    }
  }

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
      list.innerHTML = "";
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

  $("disconnectBtn").addEventListener("click", () => {
    const b = $("disconnectBtn");
    if (b.dataset.armed) { delete b.dataset.armed; b.textContent = "Disconnect Spotify"; close(); onDisconnect(); return; }
    b.dataset.armed = "1"; b.textContent = "Tap again to disconnect";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "Disconnect Spotify"; }, 4000);
  });

  return { open, close, isOpen, sync };
}
