// Keeps a local copy of Spotify's playback state in sync and runs the controls.
// Spotify offers no push updates for the Web API, so this polls (faster while playing, slower when idle,
// never while the app is hidden) and moves the progress bar locally between polls.

const POLL_PLAYING = 3000;        // while a screen shows the song position (Player, Lyrics, Spotify screen)
const POLL_PLAYING_CALM = 10000;  // while playing but no screen shows it: saves battery and requests.
                                  // Song changes still show promptly: schedule() polls just after the song should end.
const POLL_IDLE = 8000;
const POLL_BACKOFF = 15000;

// Only ever link to Spotify's own site. A link built from API data must never be able to become
// something like "javascript:..." — so we check the address instead of trusting it.
function safeSpotifyUrl(item) {
  const raw = item.external_urls && item.external_urls.spotify;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" && u.hostname === "open.spotify.com") return u.href;
  } catch { /* fall through */ }
  const m = /^spotify:(track|episode):([A-Za-z0-9]+)$/.exec(item.uri || "");
  return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : null;
}

function normalize(p) {
  if (!p) return null;
  const item = p.item;
  let track = null;
  if (item) {
    const isEpisode = item.type === "episode";
    const images = (isEpisode ? (item.images || item.show?.images) : item.album?.images) || [];
    const sorted = [...images].sort((a, b) => (b.width || 0) - (a.width || 0));
    track = {
      id: item.id || item.uri || item.name,
      uri: item.uri,
      url: safeSpotifyUrl(item),
      kind: isEpisode ? "episode" : "track",
      title: item.name,
      artists: isEpisode ? (item.show?.name || "") : (item.artists || []).map(a => a.name).join(", "),
      artist: isEpisode ? "" : ((item.artists || [])[0]?.name || ""),   // main artist only (used for lyrics lookup)
      albumName: isEpisode ? "" : (item.album?.name || ""),
      album: isEpisode ? (item.show?.publisher || "") : (item.album?.name || ""),
      image: sorted[0]?.url || null,
      duration: item.duration_ms || 0,
    };
  }
  return {
    device: p.device ? { id: p.device.id, name: p.device.name, type: p.device.type, restricted: p.device.is_restricted,
      volume: typeof p.device.volume_percent === "number" ? p.device.volume_percent : null,
      supportsVolume: p.device.supports_volume !== false } : null,
    isPlaying: !!p.is_playing,
    progress: p.progress_ms || 0,
    shuffle: !!p.shuffle_state,
    repeat: p.repeat_state || "off",
    track,
    disallows: (p.actions && p.actions.disallows) || {},
  };
}

/** wantsFast(): true while a screen shows the song position, so pauses and seeks from other devices show quickly. */
export function createPlayback(client, onChange, wantsFast = () => true) {
  let state = null;
  let status = null;     // last SpotifyError, or null when healthy
  let syncedAt = 0;
  let timer = null;
  let running = false;
  let inflight = null;

  const emit = () => onChange(state, status);

  function position() {
    if (!state || !state.track) return 0;
    const p = state.progress + (state.isPlaying ? performance.now() - syncedAt : 0);
    return Math.max(0, Math.min(p, state.track.duration));
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (!running) return;
    if (ms == null) {
      ms = state && state.isPlaying ? (wantsFast() ? POLL_PLAYING : POLL_PLAYING_CALM) : POLL_IDLE;
      if (state && state.isPlaying && state.track) {
        const left = state.track.duration - position();
        if (left > 0 && left < ms) ms = Math.max(600, left + 500); // catch the song change promptly
      }
      if (status && (status.reason === "RATE_LIMITED" || status.reason === "OFFLINE")) ms = POLL_BACKOFF;
    }
    timer = setTimeout(sync, ms);
  }

  async function sync() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const p = await client.playback();
        state = normalize(p);
        syncedAt = performance.now();
        status = null;
      } catch (e) {
        status = e;
      } finally {
        inflight = null;
      }
      emit();
      schedule();
    })();
    return inflight;
  }

  async function command(run, optimistic) {
    const before = state ? { ...state } : null;
    const beforeSynced = syncedAt;
    if (optimistic && state) {
      const pos = position();
      state = { ...state, progress: pos };
      syncedAt = performance.now();
      optimistic(state);
      emit();
    }
    try {
      await run();
      status = null;
    } catch (e) {
      if (before) { state = before; syncedAt = beforeSynced; }
      status = e;
      emit();
      schedule();
      return false;
    }
    schedule(450); // confirm with Spotify shortly after
    return true;
  }

  return {
    get state() { return state; },
    get status() { return status; },
    position,
    start() { if (running) return; running = true; sync(); },
    stop() { running = false; clearTimeout(timer); },
    refresh: () => sync(),
    /** A screen that shows the position just opened: poll now if the last answer is more than 2 s old. */
    hurry() { if (running && !inflight && performance.now() - syncedAt > 2000) sync(); },

    togglePlay() {
      if (state && state.isPlaying) return command(() => client.pause(), s => { s.isPlaying = false; });
      return command(() => client.play(), s => { s.isPlaying = true; });
    },
    next: () => command(() => client.next()),
    // Jump ahead in Up next: one "next" per song, one after the other (Spotify has no "skip to queue item").
    skip: n => command(async () => { for (let i = 0; i < n; i++) await client.next(); }),
    previous: () => command(() => client.previous()),
    seek: ms => command(() => client.seek(ms), s => { s.progress = ms; }),
    toggleShuffle: () => command(() => client.shuffle(!(state && state.shuffle)), s => { s.shuffle = !s.shuffle; }),
    cycleRepeat() {
      const order = ["off", "context", "track"];
      const nextMode = order[(order.indexOf(state ? state.repeat : "off") + 1) % order.length];
      return command(() => client.repeat(nextMode), s => { s.repeat = nextMode; });
    },
    transfer: id => command(() => client.transfer(id, true)),
    setVolume: pct => command(() => client.volume(pct), s => { if (s.device) s.device = { ...s.device, volume: pct }; }),
    playItem: what => command(() => client.playItem(what), s => { s.isPlaying = true; }),
  };
}
