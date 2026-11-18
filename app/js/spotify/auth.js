// Spotify sign-in: Authorization Code flow with PKCE.
// No client secret exists anywhere in this app — PKCE is Spotify's supported flow for apps that can't keep one.
// Tokens are stored only on this device (localStorage for this site's origin).

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
// Least privilege: only the permissions Encore actually uses.
//  user-read-playback-state   -> GET /me/player and /me/player/devices (what's playing, on which device)
//  user-modify-playback-state -> play, pause, skip, seek, shuffle, repeat, switch device
export const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
];

const KEY = {
  token: "encore.spotify.token",
  verifier: "encore.spotify.verifier",
  state: "encore.spotify.state",
};

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} },
};

/** The exact address Spotify must send you back to. Register this in the Spotify dashboard. */
export function redirectUri() {
  const u = new URL(location.href);
  u.search = ""; u.hash = "";
  u.pathname = u.pathname.replace(/index\.html$/, "");
  return u.href;
}

function b64url(bytes) {
  let s = "";
  new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest);
}

export function canSignIn() {
  return !!(window.isSecureContext && crypto && crypto.subtle);
}

/** Sends the browser to Spotify's consent page. */
export async function beginLogin(clientId) {
  const verifier = randomString(64);
  const state = randomString(16);
  store.set(KEY.verifier, verifier);
  store.set(KEY.state, state);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES.join(" "),
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: await challengeFor(verifier),
    state,
  }).toString();
  location.assign(url.href);
}

async function tokenRequest(params) {
  let r;
  try {
    r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
  } catch {
    throw Object.assign(new Error("Can't reach Spotify. Check your connection."), { code: "offline" });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error(j.error_description || j.error || `Spotify returned ${r.status}`), { code: j.error, status: r.status });
  }
  return j;
}

function save(j, previousRefresh) {
  const t = {
    access: j.access_token,
    refresh: j.refresh_token || previousRefresh, // Spotify may rotate refresh tokens
    expires: Date.now() + (j.expires_in - 60) * 1000,
    scope: j.scope || "",
  };
  store.set(KEY.token, JSON.stringify(t));
  return t;
}
function load() {
  try { return JSON.parse(store.get(KEY.token) || "null"); } catch { return null; }
}

/**
 * If the page was opened by Spotify's redirect (?code= or ?error=), finish sign-in.
 * Returns null when this isn't a redirect, {ok:true} on success, or {error} on failure.
 */
export async function handleRedirect(clientId) {
  const p = new URLSearchParams(location.search);
  if (!p.has("code") && !p.has("error")) return null;
  // Remove ?code=... from the address bar and history straight away, whatever happens next.
  history.replaceState(null, "", redirectUri());
  if (!clientId) {
    store.del(KEY.state); store.del(KEY.verifier);
    return { error: "Encore doesn't know your Client ID on this device. Enter it and connect again." };
  }
  if (p.get("error")) {
    return { error: p.get("error") === "access_denied" ? "You declined access in Spotify." : `Spotify said: ${p.get("error")}` };
  }
  if (!p.get("state") || p.get("state") !== store.get(KEY.state)) {
    return { error: "That sign-in link was out of date. Try connecting again." };
  }
  const verifier = store.get(KEY.verifier);
  store.del(KEY.state); store.del(KEY.verifier);
  try {
    const j = await tokenRequest({
      grant_type: "authorization_code",
      code: p.get("code"),
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    });
    save(j);
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

let refreshing = null;
/** A valid access token, refreshing it when it has expired (or when force is true). */
export async function getAccessToken(clientId, force = false) {
  const t = load();
  if (!t) return null;
  if (!force && Date.now() < t.expires) return t.access;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const j = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: clientId });
        return save(j, t.refresh).access;
      } catch (e) {
        if (e.code === "invalid_grant" || e.code === "invalid_client") logout(); // revoked or wrong app: sign in again
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export const isConnected = () => !!load();
export function logout() { store.del(KEY.token); }
