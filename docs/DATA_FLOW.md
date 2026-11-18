# Data flow

_Last updated: 2026-11-18._

## 1. Pressing the play button (end to end)

| Step | Where | What happens |
|---|---|---|
| 1 | You | Tap ▶ in the widget |
| 2 | `ui/nowplaying.js` | Click handler calls `playback.togglePlay()` |
| 3 | `spotify/playback.js` | `command()` updates the screen at once (optimistic update) and keeps the old state |
| 4 | `spotify/client.js` | Sends `PUT https://api.spotify.com/v1/me/player/play` with `Authorization: Bearer …` |
| 5 | Spotify | Checks the token, scope and Premium; tells your device to play |
| 6 | back in `playback.js` | Success → confirm with a fresh `GET /me/player` 450 ms later. Failure → restore old state and show the message |
| 7 | `ui/nowplaying.js` | `render()` redraws the widget |

## 2. Swiping between display modes

```
finger down ─▶ modes.js: started on a button / link / progress bar / settings / dots / size buttons? → ignore
finger up   ─▶ moved > 60 px sideways, more sideways than vertical, within 0.7 s, and the widget isn't being moved?
               yes → step(+1 or −1) → body class mode-photos|artwork|clock → CSS crossfades layers → dots update
                     → settings.mode saved → main.js ignores the "click" that ends the swipe (justSwiped)
```
Moving the widget needs a **press-and-hold (0.4 s)** first, so a quick flick across the widget is a swipe, not a drag.

## 3. A photo appears (wallpaper engine)

```
engine.setCollection(id) → library.imageKeys(id) → pick next (shuffle bag, or next in order)
  → library.getImage(key) → URL.createObjectURL(display blob) → hidden <img> → decode()
  → crossfade (CSS opacity) → revoke the previous image's URL after the fade (frees memory)
  → onShow({lum, …}) → main.js → layout.setWallpaperInfo (darker widget/clock over bright corners)
                                → photos.markCurrent (thumbnail highlight)
Timer: next change = last change + interval; paused while the app is hidden.
```

## 4. Importing photos

```
Files picker → photos.js → importer.importFiles (one file at a time)
  → SHA-256 of the original file → already in this collection? skip (duplicate)
  → decode → screen-sized copy (≤ 2732 px; original kept if already small enough) → 360 px thumbnail
  → 64 px analysis: focal point (detail + colour, gently centred) and brightness of each corner
  → library.addImage (IndexedDB)
```

## 5. The song changes → artwork mode

```
playback.js poll → nowplaying.render(state) → onTrack(track) → artmode.update(track)
  → decode new cover on hidden layer → crossfade → sample 16×16 copy's left/right edge colours (needs CORS;
    i.scdn.co sends Access-Control-Allow-Origin: *) → gradient behind the cover; logo links to the track
```

## 6. Signing in

See [AUTHENTICATION.md](AUTHENTICATION.md).

## 7. What is stored where

| Key / store | Written by | Contents |
|---|---|---|
| `encore.spotify.token` | `auth.js` | Access token, refresh token, expiry, scopes |
| `encore.spotify.verifier`, `encore.spotify.state` | `auth.js` | Temporary sign-in values; deleted after sign-in |
| `encore.spotify.clientId` | `main.js` | Your Client ID |
| `encore.settings` | `main.js` (debounced 150 ms) | Every option: mode, widget sizes/position, clock, photo rotation |
| `encore.settings.tab` | `settings.js` | Last open settings tab |
| `encore.wall.state` | `engine.js` | Current photo, shuffle bag, history, last change time |
| `standby.app` | `main.js`, `nightstand.js` | Last-used app |
| IndexedDB `encore-wallpapers` | `library.js` | Collections and images (screen-sized copy + thumbnail + analysis) |
| `nightstand*`, IndexedDB `nightstand` | `nightstand.js` | Nightstand settings, weather cache, photos |

All of this stays in the browser on that one device. Nothing is in the repository.
