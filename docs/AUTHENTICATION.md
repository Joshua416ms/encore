# Authentication

_Last updated: 2026-11-18. Code: `app/js/spotify/auth.js`._

## Authentication vs. authorization

- **Authentication** answers *who are you?* You prove it by signing in to Spotify on Spotify's own page.
- **Authorization** answers *what may this app do?* You grant Encore specific permissions (**scopes**), and Spotify enforces them.

Encore never sees your Spotify password. It only receives **tokens** that represent the permission you granted.

## OAuth 2.0 with PKCE: the sign-in flow

**OAuth 2.0** is the standard for letting an app act on your account at another service.
**PKCE** (Proof Key for Code Exchange) is the variant for apps that can't keep a secret, like a web page whose code anyone can read.

```
Encore (browser)                         Spotify
──────────────────────────────────────────────────────────────────
1. Make random code_verifier (64 bytes) and state (16 bytes).
   Save both in localStorage.
   code_challenge = SHA-256(code_verifier)
2. Go to accounts.spotify.com/authorize  ──▶  You sign in and approve the scopes
   with client_id, scopes, redirect_uri,
   code_challenge, state
3.                                       ◀──  Back to redirect_uri?code=…&state=…
4. Remove ?code from the address bar at once.
   Check state matches the saved one (stops CSRF).
5. POST /api/token with code + code_verifier ──▶  Spotify checks SHA-256(verifier) == challenge
6.                                       ◀──  access_token (1 hour) + refresh_token
7. Save tokens; delete verifier and state.
```

**Why PKCE helps:** if someone intercepts the `code` in step 3, it's useless without the `code_verifier`, which never left your browser.
**Why `state` helps (CSRF):** CSRF (cross-site request forgery) is when another site tricks your browser into finishing a sign-in that you
didn't start. Encore only accepts a returning code whose `state` matches the random value it saved in step 1.

## Tokens

| Token | Lifetime | Used for | If stolen |
|---|---|---|---|
| Access token | ~1 hour | Sent with every API request (`Authorization: Bearer …`) | Control of your playback until it expires |
| Refresh token | Long-lived (until revoked; Spotify may rotate it) | Getting a new access token | Control of your playback until you revoke access |

**Refreshing:** `getAccessToken()` checks the expiry time (with a 60-second margin) and refreshes automatically.
If two requests need a refresh at once, they share one refresh call. If Spotify replies `invalid_grant` (access revoked), the tokens are deleted and you're asked to connect again.

## Scopes requested (least privilege)

| Scope | Why Encore needs it |
|---|---|
| `user-read-playback-state` | Read what's playing and list your devices |
| `user-modify-playback-state` | Play, pause, skip, seek, shuffle, repeat, volume, switch devices, start a playlist/album/song |
| `playlist-read-private` | Spotify screen: list your private playlists |
| `playlist-read-collaborative` | Spotify screen: list collaborative playlists and their songs |
| `user-library-read` | Spotify screen: saved albums |
| `user-read-recently-played` | Spotify screen: recently played |
| `user-read-currently-playing` | Spotify screen: Up next (the queue) |

All library scopes are **read-only**: Encore can't create, change or delete playlists or saved items.
Not requested: email, following, saving/removing, uploading, or anything else.

**Signed in before 2026-11-19?** That sign-in only has the first two scopes. Now playing still works; the Spotify screen
shows "Reconnect Spotify" until you connect once more (`missingScopes()` in `auth.js` compares the stored scopes).

## Public configuration vs. secrets

| Item | Public? | Where it lives |
|---|---|---|
| Client ID | **Public by design.** It appears in the sign-in URL | `localStorage` or optionally `js/config.js` |
| Redirect URI | Public | Shown on the Connect screen |
| Client Secret | **Secret.** Encore doesn't use it at all | Nowhere. Never put it in this project |
| Access and refresh tokens | **Secret** | Only in your browser's `localStorage` |

## Signing out

- **Disconnect** (Settings) deletes the tokens from this device.
- To revoke Encore's access on Spotify's side as well, go to **spotify.com/account/apps → Remove access**. After that, the refresh token stops working everywhere.

## What can go wrong

| Symptom | Likely cause | Check |
|---|---|---|
| "INVALID_CLIENT: Invalid redirect URI" | The address isn't registered exactly (including the trailing `/`) | Spotify dashboard → your app → Redirect URIs |
| "That sign-in link was out of date" | `state` didn't match (an old tab, or storage was cleared) | Connect again from the same tab |
| Sent back to Connect after a while | The refresh token was revoked or rotated away | Connect again |
| Sign-in button does nothing | The page isn't on `https://` or `127.0.0.1` (Web Crypto needs a secure context) | Use the correct address |
