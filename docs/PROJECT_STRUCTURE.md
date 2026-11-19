# Project structure

_Last updated: 2026-11-19._

```
.
├── app/                          ← the website. Only this folder is published to GitHub Pages.
│   ├── index.html                Layers: photo backdrop, art stage, clock stage, corner slots, widget, settings, pop-up
│   ├── manifest.webmanifest      Home Screen install info
│   ├── css/app.css               All Encore styling (modes, widget, settings)
│   ├── assets/spotify/           Official Spotify logo (required attribution; unmodified)
│   ├── js/
│   │   ├── route.js              Reopens the last-used app (Encore or Nightstand)
│   │   ├── main.js               Entry point: creates modules and connects them
│   │   ├── config.js             Optional public Client ID (empty by default)
│   │   ├── sleep.js              Sleep timer (fade, pause, volume back); also loaded by Nightstand
│   │   ├── spotify/auth.js       OAuth + PKCE sign-in, token storage and refresh
│   │   ├── spotify/client.js     Spotify Web API requests and error handling
│   │   ├── spotify/playback.js   Playback state, polling, playback commands
│   │   ├── ui/nowplaying.js      Fills the widget from playback state; Spotify buttons
│   │   ├── ui/layout.js          Widget size/position, corners, drag, +/− size, clock placement
│   │   ├── ui/modes.js           Display modes (photos, artwork, lyrics, clock), dots, swipe gestures
│   │   ├── ui/library.js         Spotify screen (swipe down): controls, volume, queue, playlists, albums, history
│   │   ├── ui/sleepbutton.js     Moon button + menu for the sleep timer
│   │   ├── ui/automode.js        Automatic screen switching
│   │   ├── ui/lyricsmode.js      Lyrics screen
│   │   ├── lyrics/lrclib.js      LRCLIB lookup, timestamp parser, on-device cache
│   │   ├── ui/artmode.js         Full-screen album artwork mode
│   │   ├── ui/settings.js        Settings sheet, DEFAULTS and SCHEMA (all options)
│   │   ├── ui/photos.js          Photos tab: collections, import, thumbnails
│   │   ├── wallpapers/library.js   IndexedDB storage for collections and images
│   │   ├── wallpapers/importer.js  Image processing on import
│   │   └── wallpapers/engine.js    Wallpaper rotation and crossfade
│   └── nightstand/               Separate Nightstand app (clock, weather, calendar, photos)
├── tools/serve.py                Local test server that disables caching (python tools/serve.py)
├── docs/                         This documentation
├── .github/workflows/pages.yml   Publishes app/ to GitHub Pages
├── .gitignore / .gitattributes   What Git ignores / consistent line endings
├── README.md                     Project front page
└── SECURITY.md                   How to report a vulnerability privately
```

## Who imports what

| File | Imports | Imported by |
|---|---|---|
| `main.js` | every module below | `index.html` |
| `ui/photos.js` | `wallpapers/library.js`, `wallpapers/importer.js` | `main.js` |
| `wallpapers/importer.js` | `wallpapers/library.js` | `ui/photos.js` |
| `wallpapers/engine.js` | `wallpapers/library.js` | `main.js` |
| `spotify/client.js` | `spotify/auth.js` | `main.js` |
| `ui/settings.js`, `ui/layout.js`, `ui/modes.js`, `ui/artmode.js`, `ui/nowplaying.js`, `spotify/playback.js` | nothing | `main.js` |

To trace any feature: start at the element in `index.html`, search for its `id` in `js/`, and follow the callback into `main.js`.
