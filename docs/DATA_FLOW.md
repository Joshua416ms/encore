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

## 2b. Dragging the widget (`ui/layout.js`)

```
finger down on the widget ─▶ on a button / link / progress bar / slider?  → ignore (a normal tap)
   hold 0.4 s without moving > 10 px?  no → cancelled (if it was a quick flick, modes.js treats it as a swipe)
                                       yes → widget lifts (scale + shadow); modes.js ignores swipes (isDragging)
finger moves ─▶ new position = start + finger offset, clamped to the usable area (#safeArea)
               → applied once per screen frame (requestAnimationFrame) as transform: translate3d(x, y)
finger up   ─▶ position → fractions wX, wY of the free space; within 32 px of a corner → snap to it
               → settings.wPos = corner or "custom" → saved → short animation into place
               → the click that ends the drag is swallowed; the clock moves away if the widget now covers it
resize / rotation / −+ ─▶ same fractions re-applied → the widget stays proportionally in place and on screen
```

## 3. A photo appears (wallpaper engine)

```
engine.setCollection(id) → library.imageKeys(id) → pick next (shuffle bag, or next in order)
  → library.getImage(key) → object URLs for the photo AND its thumbnail → hidden slide
       (sharp photo sized to its own aspect ratio, never cropped; blurred thumbnail behind; darkening + vignette)
  → wait until both are decoded (unreadable photo → skipped, try the next; at most 3 in a row)
  → crossfade the two slides (CSS opacity)
  → free the old slide's images only after the NEW slide's fade-in has finished (transitionend, or a check that
    the new slide is at opacity 1). If that can't be confirmed, the old images stay until the slide is reused.
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
| `encore.settings` | `main.js` (debounced 150 ms) | Every option: mode, widget sizes, widget position (`wPos` + fractions `wX`/`wY`), clock, photo look and rotation, album-art margin |
| `encore.settings.tab` | `settings.js` | Last open settings tab |
| `encore.wall.state` | `engine.js` | Current photo, shuffle bag, history, last change time |
| `standby.app` | `main.js`, `nightstand.js` | Last-used app |
| IndexedDB `encore-wallpapers` | `library.js` | Collections and images (screen-sized copy + thumbnail + analysis) |
| `nightstand*`, IndexedDB `nightstand` | `nightstand.js` | Nightstand settings, weather cache, photos |

All of this stays in the browser on that one device. Nothing is in the repository.
