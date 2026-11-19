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
│      │                          └─ clock:   clock stage (main.js tickClock)             │
│                                                                                         │
│  ui/settings.js (tabs: Photos · Music · Display · Account) ──onChange──▶ main.js        │
│  ui/photos.js ─▶ wallpapers/importer.js ─▶ wallpapers/library.js (IndexedDB)           │
│                                                                                         │
│  ui/nowplaying.js ◀── state ── spotify/playback.js ─▶ spotify/client.js ─▶ auth.js      │
│        └── onTrack(track) ──▶ ui/artmode.js                                             │
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
| `ui/nowplaying.js` | Widget contents and Spotify buttons | `playback` |
| `ui/automode.js` | Automatic screen switching (music → album art, stopped → photos, night → clock; your choice wins for 30 min) | `modes` (via `main`) |
| `ui/lyricsmode.js` | Lyrics screen: renders lines, highlights the current one; reports whether the song has lyrics (`has`) | `lyrics/lrclib.js`, `playback` |
| `lyrics/lrclib.js` | Looks up lyrics on LRCLIB, parses timestamps, caches results on the device | LRCLIB |
| `ui/artmode.js` | Full-screen cover + edge-colour fill | receives tracks from `nowplaying` via `main` |
| `ui/settings.js` | Settings sheet; options built from `SCHEMA`; `DEFAULTS` | `onChange` callback |
| `ui/photos.js` | Collections list, import, thumbnails | `library`, `importer`, `engine` |
| `wallpapers/library.js` | IndexedDB storage of collections and images | — |
| `wallpapers/importer.js` | File → hash, screen-sized copy, thumbnail, focal point, corner brightness | `library` |
| `wallpapers/engine.js` | Rotation (random bag / sequential), prev/next, crossfade, memory release | `library` |
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
| Free the old photo only after the new one has fully faded in | Browsers pause animations in hidden tabs/backgrounded apps; a fixed timer caused a blank frame in testing | If the fade can't be confirmed, the old photo is kept a little longer (memory, never a blank) |
| No early pre-decoding of the next photo | Decoding right before the fade already hides loading | Would cost a third full-size photo in memory |
| Artwork mode: whole cover with a margin (default 9% of the short side) | Spotify forbids cropping/blurring cover art; `vmin` adapts to every iPad and orientation (≈1–1.8 cm) | Sides filled with sampled colours (or black), never a blurred cover |
| Widget position stored as fractions (`wX`, `wY` from 0 to 1) of the free space | Always on screen; survives resizing and rotation; corners are just (0,0)…(1,1) | Exact pixel position changes slightly when the widget's size changes (it stays proportionally in place) |
| Dragging needs a 0.4 s hold | Separates "move the widget" from "tap a control" and "swipe between modes" | A deliberate pause before dragging |
| Lyrics from LRCLIB, off by default | The only free, synced source that works from a browser; Spotify's API has no lyrics | **Accepted risk:** not licensed by publishers, and Spotify Policy III.5 may apply (see SECURITY.md) |
| Night mode never tints the album cover | Spotify forbids altering cover art | Only the surroundings, text and photos turn red/dark |
| A web app can't change iPad brightness | Browser limitation | Instructions for an iPad Shortcuts automation instead |
| Pan & zoom only into the empty space around a photo | Keeps the "never crop" rule while adding motion and burn-in protection | Smaller motion when the photo already fills the screen |
| Polling Spotify | The Web API has no push updates | Up to ~3 s delay for changes made elsewhere |
| System font only | Consistent typography; removed the Google Fonts request | — |
