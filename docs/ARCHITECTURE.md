# Architecture

_Last updated: 2026-11-18. Describes only what is implemented._

## The big picture

Encore is a **static web app**: HTML, CSS and JavaScript files that a web server hands to the browser unchanged.
There is **no backend**. The browser talks directly to Spotify over HTTPS; your photos never leave the device.

The screen is a **photo frame first**. Three display modes are reached by swiping or tapping the dots:

| Mode | What you see |
|---|---|
| `photos` | Your imported Cosmos photos, full screen and rotating, with the Spotify widget and clock in corners |
| `artwork` | The current Spotify cover, whole and as large as the screen allows (never cropped), plus the Spotify logo |
| `clock` | Large time and date over the darkened current photo |

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
| `ui/modes.js` | Current mode, dots, swipe gesture | `settings` (saves `mode`) |
| `ui/layout.js` | Widget size/position (CSS variables), corner slots, drag-to-corner, +/− size, clock placement, readability tint | `settings` |
| `ui/nowplaying.js` | Widget contents and Spotify buttons | `playback` |
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
| One `wScale` multiplier for +/− | Whole-widget resizing keeps proportions | Separate from the individual sliders by design |
| Artwork mode shows the whole cover | Spotify forbids cropping/blurring cover art | Sides are filled with sampled colours, not a full-bleed image |
| Polling Spotify | The Web API has no push updates | Up to ~3 s delay for changes made elsewhere |
| System font only | Consistent typography; removed the Google Fonts request | — |
