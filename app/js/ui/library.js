// The Spotify screen: a panel that slides down from the top (swipe DOWN from any screen; swipe UP to close).
//
//   left  — now playing: cover, title, large controls, progress, volume
//   right — scrolls: Up next (queue) · Your playlists · Saved albums · Recently played
//           tapping a playlist/album opens its song list with a big Play button; tapping a song plays from there.
//
// Read-only on purpose: Encore never changes your library (no search, no "+ Queue" for now).
// Spotify only shares the songs of playlists you OWN or COLLABORATE on; others show cover, name and Play only.
// Every text from Spotify is inserted with textContent (never as HTML), and links/images are checked first.
import { statusMessage, formatTime } from "./nowplaying.js";

const $ = id => document.getElementById(id);
const STALE_MS = 10 * 60 * 1000;   // playlists/albums/history are re-fetched when older than this
const MAX_PAGES = 4;               // up to 200 songs per playlist/album, 200 playlists/albums

/** Creates an element with an optional class and text (text via textContent: never parsed as HTML). */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Only Spotify's own web addresses become links.
function safeUrl(obj) {
  try {
    const u = new URL(obj && obj.external_urls && obj.external_urls.spotify);
    if (u.protocol === "https:" && u.hostname === "open.spotify.com") return u.href;
  } catch { /* not a valid address */ }
  return null;
}
// Only Spotify's image servers (the page's Content Security Policy enforces the same list).
function safeImage(images, want = 300) {
  const list = (images || []).filter(i => {
    try { const u = new URL(i.url); return u.protocol === "https:" && /(^|\.)(scdn\.co|spotifycdn\.com)$/.test(u.hostname); }
    catch { return false; }
  });
  if (!list.length) return null;
  // The smallest image that is still at least `want` px wide (sharp on Retina, light on memory); else the largest.
  const sorted = [...list].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find(i => (i.width || 0) >= want) || sorted[sorted.length - 1]).url;
}
const artistsOf = t => (t.artists || []).map(a => a.name).join(", ");

function cover(url, cls = "lib-cover") {
  const box = el("div", cls);
  if (url) {
    const img = el("img");
    img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.draggable = false;
    img.src = url;
    box.append(img);
  }
  return box;
}

export function createLibrary({ client, playback, toast, missingScopes, onReconnect }) {
  const panel = $("library"), main = $("libMain"), detail = $("libDetail"), scroller = $("libScroll");
  let open = false, cache = null, loadedAt = 0, me = null, detailFor = null, volumeTouched = 0, progressTimer = null;

  /* ---------- open / close ---------- */
  function show() {
    if (open) return;
    open = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("lib-open");
    render(playback.state);
    load();
    clearInterval(progressTimer);
    progressTimer = setInterval(() => { if (!document.hidden) renderProgress(); }, 500);
  }
  function hide() {
    if (!open) return;
    open = false;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lib-open");
    clearInterval(progressTimer);
  }
  $("libClose").addEventListener("click", e => { e.stopPropagation(); hide(); });
  panel.addEventListener("click", e => e.stopPropagation());   // taps inside don't reach the "show controls" handler

  /* ---------- now playing (left column) ---------- */
  let lastArt = null;
  function render(state) {
    if (!open) return;
    const t = state && state.track;
    const art = t && t.image;
    if (art !== lastArt) {
      lastArt = art;
      const img = $("libArt");
      img.classList.toggle("on", !!art);
      if (art) img.src = art; else img.removeAttribute("src");
    }
    $("libTitle").textContent = t ? t.title : "Nothing playing";
    $("libArtist").textContent = t ? t.artists : "Pick something from your library.";
    $("libLogo").href = (t && t.url) || "https://open.spotify.com/";
    $("libDevice").textContent = state && state.device ? `Playing on ${state.device.name}` : "No active device";

    const playing = !!(state && state.isPlaying);
    const play = $("libPlay");
    play.classList.toggle("playing", playing);
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
    $("libShuffle").classList.toggle("on", !!(state && state.shuffle));
    $("libShuffle").setAttribute("aria-pressed", String(!!(state && state.shuffle)));
    const rep = state ? state.repeat : "off";
    $("libRepeat").classList.toggle("on", rep !== "off");
    $("libRepeat").classList.toggle("repeat-one", rep === "track");
    $("libRepeat").setAttribute("aria-label", `Repeat: ${rep === "track" ? "this song" : rep === "context" ? "on" : "off"}`);

    // Volume: some devices (e.g. some speakers, the iPhone app) don't allow it.
    const dev = state && state.device, vol = $("libVolume");
    const canVolume = !!(dev && dev.supportsVolume && dev.volume != null);
    vol.disabled = !canVolume;
    $("libVolumeRow").classList.toggle("disabled", !canVolume);
    if (canVolume && Date.now() - volumeTouched > 2500) vol.value = dev.volume;  // don't fight your finger
    renderProgress();
  }
  function renderProgress() {
    const s = playback.state, dur = s && s.track ? s.track.duration : 0, pos = playback.position();
    $("libBarFill").style.width = dur ? `${(pos / dur) * 100}%` : "0%";
    $("libElapsed").textContent = formatTime(pos);
    $("libRemaining").textContent = dur ? `-${formatTime(dur - pos)}` : "0:00";
  }

  async function run(action) {
    const ok = await action();
    if (ok === false) toast(statusMessage(playback.status) || "Spotify couldn't do that right now.");
    return ok;
  }
  $("libPlay").addEventListener("click", () => run(() => playback.togglePlay()));
  $("libPrev").addEventListener("click", () => run(() => playback.previous()));
  $("libNext").addEventListener("click", () => run(() => playback.next()));
  $("libShuffle").addEventListener("click", () => run(() => playback.toggleShuffle()));
  $("libRepeat").addEventListener("click", () => run(() => playback.cycleRepeat()));
  let volTimer;
  $("libVolume").addEventListener("input", e => {
    volumeTouched = Date.now();
    clearTimeout(volTimer);
    const v = Number(e.target.value);
    volTimer = setTimeout(() => run(() => playback.setVolume(v)), 250);   // one request after you stop moving
  });

  /* ---------- library (right column) ---------- */
  async function allPages(fetchPage) {
    const out = [];
    for (let page = 0, offset = 0; page < MAX_PAGES; page++) {
      const r = await fetchPage(offset);
      const items = (r && r.items) || [];
      out.push(...items);
      if (!r || !r.next || !items.length) break;
      offset += items.length;
    }
    return out;
  }

  async function load() {
    const missing = missingScopes();
    $("libReconnect").hidden = !missing.length;
    if (missing.length) { main.textContent = ""; return; }   // older sign-in: only "now playing" works until you reconnect

    const fresh = cache && Date.now() - loadedAt < STALE_MS;
    if (!cache) main.replaceChildren(el("p", "lib-hint", "Loading your library…"));
    const queueP = client.queue().catch(e => ({ error: e }));
    if (!fresh) {
      const [meR, pl, al, rp] = await Promise.allSettled([
        me ? Promise.resolve(me) : client.me(),
        allPages(o => client.playlists(o)),
        allPages(o => client.savedAlbums(o)),
        client.recentlyPlayed(),
      ]);
      if (meR.status === "fulfilled") me = meR.value;
      cache = {
        playlists: pl.status === "fulfilled" ? pl.value.filter(Boolean) : { error: pl.reason },
        albums: al.status === "fulfilled" ? al.value.map(i => i && i.album).filter(Boolean) : { error: al.reason },
        recent: rp.status === "fulfilled" ? ((rp.value && rp.value.items) || []) : { error: rp.reason },
      };
      loadedAt = Date.now();
    }
    cache.queue = await queueP;
    if (open && !detailFor) renderMain();
  }

  // Called when the song changes: Up next has moved on.
  async function refreshQueue() {
    if (!open || !cache) return;
    cache.queue = await client.queue().catch(e => ({ error: e }));
    if (open && !detailFor) renderMain();
  }

  function section(title) {
    const s = el("section", "lib-section");
    s.append(el("h3", null, title));
    return s;
  }
  function errorLine(err) {
    if (err && err.status === 403) return "Spotify didn't allow Encore to read this. Reconnecting Spotify may help.";
    return statusMessage(err) || "Couldn't load this from Spotify.";
  }

  function trackRow(t, { onPlay, index } = {}) {
    const row = el(onPlay ? "button" : "div", "lib-row");
    if (onPlay) { row.type = "button"; row.addEventListener("click", onPlay); }
    if (index != null) row.append(el("span", "lib-num", String(index)));
    else row.append(cover(safeImage((t.album || {}).images || t.images, 64), "lib-thumb"));
    const text = el("span", "lib-text");
    text.append(el("b", null, t.name || "Unknown"), el("span", null, artistsOf(t) || (t.show && t.show.name) || ""));
    row.append(text);
    if (t.duration_ms) row.append(el("span", "lib-dur", formatTime(t.duration_ms)));
    const playingNow = playback.state && playback.state.track && playback.state.track.uri === t.uri;
    row.classList.toggle("now", !!playingNow);
    return row;
  }

  function card(item, kind) {
    const b = el("button", "lib-card");
    b.type = "button";
    b.append(cover(safeImage(item.images, 300)));
    b.append(el("b", null, item.name || ""));
    const sub = kind === "album" ? artistsOf(item) : (item.owner && item.owner.display_name) || "";
    b.append(el("span", null, sub));
    b.addEventListener("click", () => openDetail(item, kind));
    return b;
  }

  function grid(items, kind, initial = 12) {
    const wrap = el("div");
    const g = el("div", "lib-grid");
    items.slice(0, initial).forEach(i => g.append(card(i, kind)));
    wrap.append(g);
    if (items.length > initial) {
      const more = el("button", "btn ghost tiny lib-more", `Show all ${items.length}`);
      more.type = "button";
      more.addEventListener("click", () => { items.slice(initial).forEach(i => g.append(card(i, kind))); more.remove(); });
      wrap.append(more);
    }
    return wrap;
  }

  function renderMain() {
    detail.hidden = true;
    main.hidden = false;
    main.textContent = "";

    // Up next
    const q = section("Up next");
    if (cache.queue && cache.queue.error) q.append(el("p", "lib-hint", errorLine(cache.queue.error)));
    else {
      const items = ((cache.queue && cache.queue.queue) || []).filter(Boolean).slice(0, 10);
      if (!items.length) q.append(el("p", "lib-hint", "Nothing queued. Spotify shows what plays next once something is playing."));
      items.forEach(t => q.append(trackRow(t)));
    }
    main.append(q);

    // Playlists
    const p = section("Your playlists");
    if (cache.playlists.error) p.append(el("p", "lib-hint", errorLine(cache.playlists.error)));
    else if (!cache.playlists.length) p.append(el("p", "lib-hint", "No playlists yet."));
    else p.append(grid(cache.playlists, "playlist"));
    main.append(p);

    // Saved albums
    const a = section("Saved albums");
    if (cache.albums.error) a.append(el("p", "lib-hint", errorLine(cache.albums.error)));
    else if (!cache.albums.length) a.append(el("p", "lib-hint", "No saved albums. Albums you save in Spotify appear here."));
    else a.append(grid(cache.albums, "album"));
    main.append(a);

    // Recently played (the same song can appear several times: show it once)
    const r = section("Recently played");
    if (cache.recent.error) r.append(el("p", "lib-hint", errorLine(cache.recent.error)));
    else {
      const seen = new Set();
      const tracks = cache.recent.map(i => i && i.track).filter(t => t && t.uri && !seen.has(t.uri) && seen.add(t.uri));
      if (!tracks.length) r.append(el("p", "lib-hint", "Nothing played recently."));
      tracks.forEach(t => r.append(trackRow(t, { onPlay: () => run(() => playback.playItem({ uris: [t.uri] })) })));
    }
    main.append(r);
  }

  /* ---------- playlist / album detail ---------- */
  async function openDetail(item, kind) {
    detailFor = item.id;
    main.hidden = true;
    detail.hidden = false;
    detail.textContent = "";
    scroller.scrollTop = 0;

    const back = el("button", "lib-back", "‹ Library");
    back.type = "button";
    back.addEventListener("click", closeDetail);

    const head = el("div", "lib-detail-head");
    head.append(cover(safeImage(item.images, 300), "lib-cover big"));
    const info = el("div", "lib-detail-info");
    info.append(el("span", "lib-kind", kind === "album" ? "Album" : "Playlist"), el("h2", null, item.name || ""));
    const total = kind === "album" ? item.total_tracks : ((item.items || item.tracks || {}).total);
    const by = kind === "album" ? artistsOf(item) : (item.owner && item.owner.display_name) || "";
    const year = kind === "album" && item.release_date ? item.release_date.slice(0, 4) : "";
    info.append(el("p", null, [by, year, total ? `${total} songs` : ""].filter(Boolean).join(" · ")));
    const actions = el("div", "lib-actions");
    const play = el("button", "btn lib-play", "Play");
    play.type = "button";
    play.addEventListener("click", () => run(() => playback.playItem({ contextUri: item.uri })));
    actions.append(play);
    const url = safeUrl(item);
    if (url) {
      const link = el("a", "btn ghost tiny", "Open in Spotify");
      link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
      actions.append(link);
    }
    info.append(actions);
    head.append(info);
    detail.append(back, head);

    // Spotify only lists the songs of your own and collaborative playlists.
    const mine = kind === "album" || item.collaborative || (me && item.owner && item.owner.id === me.id);
    if (!mine) {
      detail.append(el("p", "lib-hint", "Spotify only lets apps list the songs of playlists you made or collaborate on. You can still play this one."));
      return;
    }

    const list = el("div", "lib-tracks");
    list.append(el("p", "lib-hint", "Loading songs…"));
    detail.append(list);
    try {
      const raw = kind === "album"
        ? await allPages(o => client.albumTracks(item.id, o))
        : (await allPages(o => client.playlistItems(item.id, o))).map(i => i && (i.item || i.track));
      if (detailFor !== item.id) return;               // you went back or opened something else meanwhile
      list.textContent = "";
      const tracks = raw.filter(t => t && t.uri);
      if (!tracks.length) list.append(el("p", "lib-hint", "This one is empty."));
      tracks.forEach((t, i) => {
        // Songs stored only on a computer ("local files") can't be started from here.
        const playable = !t.is_local;
        const row = trackRow(t, { index: i + 1, onPlay: playable ? () => run(() => playback.playItem({ contextUri: item.uri, offsetUri: t.uri })) : null });
        if (!playable) row.classList.add("disabled");
        list.append(row);
      });
    } catch (e) {
      if (detailFor !== item.id) return;
      list.textContent = "";
      list.append(el("p", "lib-hint", e.status === 403
        ? "Spotify only lets apps list the songs of playlists you made or collaborate on. You can still play this one."
        : errorLine(e)));
    }
  }
  function closeDetail() {
    detailFor = null;
    if (cache) renderMain(); else { detail.hidden = true; main.hidden = false; }
  }

  $("libReconnectBtn").addEventListener("click", () => { hide(); onReconnect(); });

  return {
    open: show, close: hide,
    isOpen: () => open,
    render,
    onTrack: refreshQueue,
    reset() { cache = null; me = null; detailFor = null; main.textContent = ""; detail.textContent = ""; },
  };
}
