// Thin Spotify Web API client. Every call goes to the official Web API with the signed-in user's token.
import { getAccessToken } from "./auth.js";

const API = "https://api.spotify.com/v1";

export class SpotifyError extends Error {
  constructor(status, reason, message) {
    super(message || reason || `Spotify returned ${status}`);
    this.status = status;   // HTTP status, 0 when offline
    this.reason = reason;   // e.g. PREMIUM_REQUIRED, NO_ACTIVE_DEVICE, RATE_LIMITED, NOT_CONNECTED, OFFLINE
  }
}

export function createClient(getClientId) {
  let backoffUntil = 0;

  async function call(method, path, { query, body } = {}, retry = true) {
    if (Date.now() < backoffUntil) throw new SpotifyError(429, "RATE_LIMITED");
    let token;
    try { token = await getAccessToken(getClientId()); }
    catch (e) { throw new SpotifyError(e.code === "offline" ? 0 : 401, e.code === "offline" ? "OFFLINE" : "NOT_CONNECTED", e.message); }
    if (!token) throw new SpotifyError(401, "NOT_CONNECTED");

    const url = new URL(API + path);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);

    let r;
    try {
      r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SpotifyError(0, "OFFLINE", "No connection to Spotify.");
    }

    if (r.status === 401 && retry) {
      try { await getAccessToken(getClientId(), true); }
      catch (e) { throw new SpotifyError(401, "NOT_CONNECTED", e.message); }
      return call(method, path, { query, body }, false);
    }
    if (r.status === 429) {
      const wait = Number(r.headers.get("Retry-After")) || 10;
      backoffUntil = Date.now() + wait * 1000;
      throw new SpotifyError(429, "RATE_LIMITED");
    }
    if (r.status === 204 || r.status === 202) return null;

    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) {
      const err = j && j.error;
      let reason = err && err.reason;
      if (!reason && r.status === 403 && /premium/i.test(err?.message || "")) reason = "PREMIUM_REQUIRED";
      if (!reason && r.status === 404 && /device/i.test(err?.message || "")) reason = "NO_ACTIVE_DEVICE";
      if (!reason && r.status === 403 && /restrict/i.test(err?.message || "")) reason = "RESTRICTED";
      throw new SpotifyError(r.status, reason, err?.message);
    }
    return j;
  }

  return {
    me: () => call("GET", "/me"),
    playback: () => call("GET", "/me/player", { query: { additional_types: "episode" } }),
    devices: () => call("GET", "/me/player/devices"),
    play: deviceId => call("PUT", "/me/player/play", { query: { device_id: deviceId } }),
    pause: () => call("PUT", "/me/player/pause"),
    next: () => call("POST", "/me/player/next"),
    previous: () => call("POST", "/me/player/previous"),
    seek: ms => call("PUT", "/me/player/seek", { query: { position_ms: Math.max(0, Math.round(ms)) } }),
    shuffle: on => call("PUT", "/me/player/shuffle", { query: { state: on } }),
    repeat: mode => call("PUT", "/me/player/repeat", { query: { state: mode } }),
    transfer: (deviceId, play = true) => call("PUT", "/me/player", { body: { device_ids: [deviceId], play } }),
    volume: pct => call("PUT", "/me/player/volume", { query: { volume_percent: Math.max(0, Math.min(100, Math.round(pct))) } }),
    // Start playing: a playlist/album (contextUri, optionally from one song) or a list of songs (uris).
    playItem: ({ contextUri, offsetUri, uris }) => call("PUT", "/me/player/play", {
      body: contextUri ? { context_uri: contextUri, ...(offsetUri ? { offset: { uri: offsetUri } } : {}) } : { uris },
    }),

    // Library (read-only; see SCOPES in auth.js)
    queue: () => call("GET", "/me/player/queue"),
    playlists: (offset = 0) => call("GET", "/me/playlists", { query: { limit: 50, offset } }),
    // Songs of a playlist. Spotify only allows this for playlists you own or collaborate on (others: 403).
    playlistItems: (id, offset = 0) => call("GET", `/playlists/${encodeURIComponent(id)}/items`, { query: { limit: 50, offset } }),
    savedAlbums: (offset = 0) => call("GET", "/me/albums", { query: { limit: 50, offset } }),
    albumTracks: (id, offset = 0) => call("GET", `/albums/${encodeURIComponent(id)}/tracks`, { query: { limit: 50, offset } }),
    recentlyPlayed: () => call("GET", "/me/player/recently-played", { query: { limit: 30 } }),
  };
}
