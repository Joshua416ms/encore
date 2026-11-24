# Architecture

_Last updated: 2026-11-19. Describes only what is implemented._

## The big picture

Encore is a **static web app**: HTML, CSS and JavaScript files that a web server hands to the browser unchanged.
There is **no backend**. The browser talks directly to Spotify over HTTPS; your photos never leave the device.

The screen is a **photo frame first**. Three display modes are reached by swiping or tapping the dots:

| Mode | What you see |
|---|---|
| `photos` | Your imported Cosmos photos, full screen and rotating, with the Spotify widget and clock in corners |
| `artwork` | The current Spotify cover, whole and as large as the screen allows (never cropped), plus the Spotify logo |
| `player` | Whole cover on the left; title, artist, album, seek bar, ⏮ ⏯ ⏭, shuffle and repeat on the right; background is the cover's edge colours, darkened |
| `lyrics` | Lyrics of the current song (only when turned on **and** the song has lyrics) |
| `clock` | Large time and date over the darkened current photo |

Vertical swipes: **down** opens the **Spotify screen** (`ui/library.js`, a panel over every mode); **up** closes it,
or, when it's closed, goes to the separate Nightstand app (which comes back with a swipe down).

```
┌──────────────────────────────────── iPad / browser ────────────────────────────────────┐
│ index.html → route.js (reopen last app) → main.js (creates and connects every module)  │
│                                                                                         │
│  ui/modes.js ── body.mode-* ──▶ CSS shows one layer:                                    │
│      ▲ swipe / dots             ┌─ photos: backdrop (wallpapers/engine.js)              │
│      │                          │          + corner slots (ui/layout.js) ─ widget, clock│
│      │                          ├─ artwork: art stage (ui/artmode.js)                   │
│      │                          ├─ player:  player stage (ui/playermode.js)             │
│      │                          └─ clock:   clock stage (main.js tickClock)             │
│                                                                                         │
│  ui/settings.js (tabs: Photos · Music · Display · Account) ──onChange──▶ main.js        │
│  ui/photos.js ─▶ wallpapers/importer.js ─▶ wallpapers/library.js (IndexedDB)           │
│                                                                                         │
│  ui/nowplaying.js ◀── state ── spotify/playback.js ─▶ spotify/client.js ─▶ auth.js      │
│        └── onTrack(track) ──▶ ui/artmode.js, ui/playermode.js                           │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                     HTTPS  ▼
                     api.spotify.com · accounts.spotify.com · i.scdn.co (cover images)
```

## Modules and what they own

| Module | Owns | Talks to |
|---|---|---|
| `main.js` | Startup, wiring, clock text, wake lock, connect pop-up | Everything (only place that knows all modules) |
| `ui/modes.js` | Current mode, dots, horizontal swipes; reports vertical swipes (`onVertical`) | `settings` (saves `mode`) |
| `ui/library.js` | Spotify screen: now playing with large controls and volume; Up next, playlists, saved albums, recently played; song lists | `client`, `playback` |
| `ui/layout.js` | Widget size (CSS variables), free position of the dock (fractions `wX`/`wY`), press-and-hold dragging, +/− size, clock placement, readability tint | `settings` |
| `ui/nowplaying.js` | Widget contents and Spotify buttons; exports the shared `crossfader`, `paintControls` and `createSeekBar` | `playback` |
| `ui/progressclock.js` | One shared 1 s clock for the position bars and plain lyrics; runs only while a song plays and a bar is on screen. `createMover` moves a bar with a CSS transition between ticks | `playback` |
| `ui/playermode.js` | Player screen: cover, song text, seek bar and controls (reuses the helpers from `nowplaying.js`) | `playback`, `nowplaying` |
| `ui/lyricsmode.js` | Lyrics screen: renders lines, highlights the current one; reports whether the song has lyrics (`has`) | `lyrics/lrclib.js`, `playback` |
| `lyrics/lrclib.js` | Looks up lyrics on LRCLIB, parses timestamps, caches results on the device | LRCLIB |
| `ui/handoff.js` | Cover hand-off: a copy of the cover flies between the Album art and Player screens during the crossfade (called from `modes.set`) | `modes` |
| `ui/artmode.js` | Full-screen cover + edge-colour fill | receives tracks from `nowplaying` via `main` |
| `ui/settings.js` | Settings sheet; options built from `SCHEMA`; `DEFAULTS` | `onChange` callback |
| `ui/photos.js` | Collections list, import, thumbnails | `library`, `importer`, `engine` |
| `wallpapers/library.js` | IndexedDB storage of collections and images | — |
| `wallpapers/importer.js` | File → hash, screen-sized copy, thumbnail, focal point, corner brightness | `library` |
| `wallpapers/engine.js` | Rotation (random bag / sequential), prev/next, crossfade, memory release | `library` |
| `sleep.js` | Sleep timer: end time in localStorage, fade, pause, volume restore; shared by Encore and Nightstand | Spotify (`client.js`) |
| `ui/sleepbutton.js` | Moon button and its menu in the Spotify screen | `sleep.js` |
| `spotify/*` | Sign-in, API calls, playback sync (unchanged by the redesign) | Spotify |

**Rule:** modules don't import each other's UI. `main.js` connects them with small callbacks
(`onShow`, `onChange`, `onTrack`, `onModeChange`), so the Spotify and photo parts can change independently.

## Key design decisions

| Decision | Why | Trade-off |
|---|---|---|
| Web app, not native Swift | No Mac needed; deploys by copying files | Can't run in the background; the iPad must stay unlocked |
| No backend | Nothing server-side to secure; free hosting | Tokens live on the device (see SECURITY.md) |
| No framework, no build step, no third-party code | Everything is readable; nothing external to trust | More manual DOM code |
| Photos imported from Files | Cosmos has no official API; undocumented endpoints are excluded on purpose | You download from Cosmos, then import |
| Settings → CSS custom properties | Each size is its own variable, so they change independently | Limits (clamps) live in `layout.js` |
| One `wScale` multiplier for +/− | Whole-widget resizing keeps proportions | — |
| Widget width, padding, blur and corners are fixed (`FIXED` in `settings.js`), not settings | Fewer knobs; − / + already resizes; corners are capped at 8 px by Spotify anyway | Old saved values are deleted on load, so a customised widget returns to the default look |
| Lyrics screen only exists while the song has lyrics | No empty screen; returns to Lyrics automatically after a song without | One automatic move you didn't make (undone by any swipe of your own) |
| Vertical swipes for the Spotify screen and Nightstand, no buttons | Quick to reach from every screen; no clutter | Not discoverable in the app (documented in README); must start away from the screen edges |
| Spotify screen is read-only (no search, no "+ Queue") | Fewer scopes, smaller first version | Followed playlists can only be played, not browsed (Spotify returns 403) |
| Photos shown whole (`contain`) over a blurred copy | Nothing is ever cropped or stretched; the screen still feels full | Two layers per photo; the blurred one uses the 360 px thumbnail to keep memory and GPU work low |
| Background blur is baked into a picture (canvas filter) once per photo, not a live CSS filter; widget and clock use a solid tint, not `backdrop-filter` | A live blur on (or over) a photo that pans and zooms is redone by the GPU every frame, for hours: the biggest battery drain | Needs Safari 18+ for canvas filters; older browsers fall back to the CSS filter. The widget is no longer "frosted glass" (a little darker instead) |
| Free the old photo only after the new one has fully faded in | Browsers pause animations in hidden tabs/backgrounded apps; a fixed timer caused a blank frame in testing | If the fade can't be confirmed, the old photo is kept a little longer (memory, never a blank) |
| No early pre-decoding of the next photo | Decoding right before the fade already hides loading | Would cost a third full-size photo in memory |
| Artwork mode: whole cover with a margin (default 9% of the short side) | Spotify forbids cropping/blurring cover art; `vmin` adapts to every iPad and orientation (≈1–1.8 cm) | Sides filled with sampled colours (or black), never a blurred cover |
| Widget position stored as fractions (`wX`, `wY` from 0 to 1) of the free space | Always on screen; survives resizing and rotation; corners are just (0,0)…(1,1) | Exact pixel position changes slightly when the widget's size changes (it stays proportionally in place) |
| Dragging needs a 0.4 s hold | Separates "move the widget" from "tap a control" and "swipe between modes" | A deliberate pause before dragging |
| Lyrics from LRCLIB, off by default | The only free, synced source that works from a browser; Spotify's API has no lyrics | **Accepted risk:** not licensed by publishers, and Spotify Policy III.5 may apply (see SECURITY.md) |
| Night mode never tints the album cover | Spotify forbids altering cover art | Only the surroundings, text and photos turn red/dark |
| A web app can't change iPad brightness | Browser limitation | Instructions for an iPad Shortcuts automation instead |
| Pan & zoom only into the empty space around a photo | Keeps the "never crop" rule while adding motion and burn-in protection | Smaller motion when the photo already fills the screen |
| Sleep timer's end time lives in localStorage | Encore and Nightstand are separate pages; a JavaScript timer would die when you swipe between them | Both pages check the clock every second while a timer runs |
| Screen stays on while a sleep timer runs, even with "Keep screen on" off | A locked iPad freezes the page, so the timer couldn't stop the music | The screen is on until the timer ends, then the iPad locks after its Auto-Lock time |
| Nightstand follows Encore's "Keep screen on" switch | One setting for both apps | Nightstand has no switch of its own |
| Polling Spotify | The Web API has no push updates | Up to ~3 s delay for changes made elsewhere on the Player, Lyrics and Spotify screens; up to ~10 s on the others (song changes still show within ~0.5 s: a poll is set for just after the song should end) |
| Position bars tick once a second (shared clock) and a linear CSS transition moves them in between; synced lyrics set one timer for the next line | Fewer CPU wake-ups: before, 2 bars repainted 4×/s, the Spotify screen 2×/s and lyrics checked 5×/s, even off screen | Time labels change once a second (on the song's whole seconds, so on time); bars only move with `transform` |
| Motion: easing tokens `--out` / `--in` / `--give` in `:root` (same strings as `OUT` / `IN` in JS); `transform`/`opacity` first, WAAPI for sequences, every `animate()` checks reduced motion. Switch Stretch, sheet slide + settle, Inchworm pill and Detent slider live in `settings.js` + app.css; play morph (`.glyph`) and colour-first track change in app.css + `artmode.js` / `nowplaying.js`; cover hand-off in `handoff.js` | One feel across the app; the global reduced-motion CSS rule doesn't reach WAAPI | `--give` overshoots a little (switch only); with reduced motion the movement is skipped but colour and opacity changes stay |
| System font only | Consistent typography; removed the Google Fonts request | — |
