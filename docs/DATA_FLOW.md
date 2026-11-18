# Data flow

_Last updated: 2026-11-18._

## 1. Pressing the play button (end to end)

| Step | Where | What happens |
|---|---|---|
| 1 | You | Tap ▶ |
| 2 | `ui/nowplaying.js`: `$("playBtn").onclick` | The browser fires a click event; the handler calls `playback.togglePlay()` |
| 3 | `spotify/playback.js`: `togglePlay()` | Not playing → chooses `client.play()` |
| 4 | `playback.js`: `command()` | **Optimistic update**: sets `isPlaying = true` and redraws at once, keeping a copy of the old state |
| 5 | `spotify/client.js`: `call("PUT", "/me/player/play")` | Gets a valid token from `auth.js` (refreshing if needed), sends HTTPS `PUT` with `Authorization: Bearer …` |
| 6 | Spotify | Checks the token, the scope and Premium, then tells your active device to play |
| 7 | Spotify → Encore | `204 No Content` on success, or an error such as `403 PREMIUM_REQUIRED` / `404 NO_ACTIVE_DEVICE` |
| 8a | `command()` on success | Schedules a fresh `GET /me/player` 450 ms later to confirm |
| 8b | `command()` on failure | Restores the saved state and stores the error |
| 9 | `nowplaying.js`: `render()` | Redraws the button, the enabled/disabled controls and the status message |

**Debug it yourself:** open the browser's developer tools → **Network** tab → press play → click the `play` request.
You'll see the method, status code and response. The `Authorization` header contains your token, so **never screenshot or share it**.

## 2. Staying in sync (polling)

```
start() ─▶ sync(): GET /me/player ─▶ normalize() ─▶ onChange(state) ─▶ render()
              ▲                                                         │
              └──── setTimeout: 3 s playing / 8 s paused / 15 s after an error ◀┘
Between polls: position() = last progress + time elapsed (if playing) → progress bar updates every 250 ms
App hidden → stop(); visible again → start()
```

## 3. Signing in

See the sequence diagram in [AUTHENTICATION.md](AUTHENTICATION.md).

## 4. Switching between Encore and Nightstand

```
Home Screen icon ─▶ app/index.html ─▶ js/route.js
     localStorage["standby.app"] == "nightstand" and no ?query  →  go to nightstand/
     otherwise                                                   →  stay on Encore
Encore settings "Switch"     → sets "nightstand" → link to nightstand/
Nightstand settings "Switch" → sets "encore"     → link to ../
```

## 5. What is stored where

| Key / store | Written by | Contents |
|---|---|---|
| `encore.spotify.token` | `auth.js` | Access token, refresh token, expiry, scopes |
| `encore.spotify.verifier`, `encore.spotify.state` | `auth.js` | Temporary sign-in values; deleted after sign-in |
| `encore.spotify.clientId` | `main.js` | Your Client ID |
| `encore.settings` | `main.js` | Artwork size, clock/date/controls visibility, 24-hour time |
| `standby.app` | `main.js`, `nightstand.js` | Last-used app |
| `nightstand`, `nightstand-wx`, `nightstand-page` | `nightstand.js` | Nightstand settings (including chosen location), weather cache, last view |
| IndexedDB `nightstand` | `nightstand.js` | Your Nightstand photos (resized) |

All of this stays in the browser on that one device. It is not in the repository and is not sent anywhere except as listed in API_INTEGRATIONS.md.
