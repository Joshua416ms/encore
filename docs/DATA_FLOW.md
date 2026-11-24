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
finger down ─▶ modes.js: started on a button / link / progress bar / settings / dots / size buttons? → no sideways swipe
finger up   ─▶ moved > 60 px sideways, more sideways than vertical, within 0.7 s, and the widget isn't being moved?
               yes → step(+1 or −1) → body class mode-photos|artwork|lyrics|clock → CSS crossfades layers → dots update
                     → settings.mode saved → main.js ignores the "click" that ends the swipe (justSwiped)
```

**Vertical swipes** (same 60 px / 0.7 s rule; must start more than 56 px from the top and bottom edges, which belong to
iPadOS; may start on a button, whose click is then cancelled):

```
swipe DOWN ─▶ Spotify screen open? nothing : connected? library.open() : Connect pop-up
swipe UP   ─▶ Spotify screen open? library.close() : setNightstand(true) → Nightstand sheet slides up
Nightstand: swipe DOWN (touch events, because its pager scrolls natively) ─▶ postMessage {type:"nightstand", close}
            ─▶ Encore: setNightstand(false) → the sheet slides back down
```

**Nightstand sheet.** Nightstand is an iframe (`nightstand/?embed=1`, `#nsFrame`) loaded when Encore starts and kept
above everything but the sleep screen. `:root.ns-up` puts it up: it slides from the bottom in .45 s `var(--ease)` once
the swipe ends (a fade with Reduce Motion). `setNightstand(up)` saves `standby.app`, makes the rest of Encore `inert`,
rests Encore's wallpaper slideshow while covered, and posts `{type:"encore", shown, asleep}` to the iframe, which then
rests its clock (once a minute) and slideshow while down and lets go of the screen while asleep. Encore keeps polling
Spotify underneath, so Auto mode still moves to Player out of sight. Embedded, Nightstand runs no sleep timer of its
own (Encore's sleep screen covers the sheet) and doesn't write `standby.app`. Opened on its own (`nightstand/`, old
bookmarks) it works as before: swipe down goes to `../`. On start, `route.js` adds `ns-up` before the first paint when
`standby.app` is "nightstand", so the Home Screen icon reopens with the sheet already up, no slide.
Inside the Spotify screen the library column scrolls, so swipe up on the now-playing side, the header or the handle.
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

## 2c. Automatic screen switching (`ui/automode.js`)

```
playback update ─▶ playing?  yes → on Album art or Lyrics already? stay : switch to Album art
                             no  → stopped for ≥ autoPhotosAfter minutes? → night ? Clock : Photos
every 15 s, on wake, on settings change ─▶ same check
you swipe/tap a dot ─▶ modes.set(…, "user") ─▶ automode waits 30 min (ends early when music starts/stops)
```

## 2d. Lyrics (`lyrics/lrclib.js`, `ui/lyricsmode.js`) — only when turned on

```
song changes ─▶ lyrics.update(track): keep showing the old lyrics (frozen) while looking up the new ones
  → cache hit? use it : GET lrclib.net/api/get (title, main artist, album, length)
  → synced → lines with times · plain → text · 404/instrumental → none
  → lyrics.has changed? → main.js lyricsAvailability(has):
       none, and you were on Lyrics → Album art, remember returnToLyrics (the Lyrics dot disappears)
       has lyrics, returnToLyrics, still on Album art → back to Lyrics
       any swipe/dot of your own, or leaving Album art → forget returnToLyrics
every 200 ms in Lyrics mode ─▶ position = playback.position() + offset → binary search → highlight + centre line
```

## 2e. Night mode and time of day (`main.js`, every minute and on wake)

```
isNight() (schedule, "Always on" or "Off") → <html class="night"> → CSS: red text, darker photos, smaller clock
periodNow() → morning / afternoon / evening / night → wallByPeriod[period] or the active collection → engine
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
| `standby.app` | `main.js` (and `nightstand.js` when opened on its own) | Was the Nightstand sheet up last ("nightstand" / "encore") |
| IndexedDB `encore-wallpapers` | `library.js` | Collections and images (screen-sized copy + thumbnail + analysis + `hidden` flag) |
| IndexedDB `encore-lyrics` | `lrclib.js` | Lyrics per Spotify track id (max 200, oldest removed first) |
| `nightstand*`, IndexedDB `nightstand` | `nightstand.js` | Nightstand settings, weather cache, photos |

All of this stays in the browser on that one device. Nothing is in the repository.
