# Project structure

_Last updated: 2026-11-18._

```
.
├── app/                         ← the website. Only this folder is published to GitHub Pages.
│   ├── index.html               Encore page: backdrop, player, connect screen, settings sheet
│   ├── manifest.webmanifest     Home Screen install info (name, colors, start page)
│   ├── css/app.css              Encore's visual design
│   ├── assets/spotify/          Official Spotify logo (required attribution; unmodified)
│   ├── js/
│   │   ├── route.js             Reopens the last-used app (Encore or Nightstand)
│   │   ├── main.js              Entry point: settings, clock, wake lock, connects modules
│   │   ├── config.js            Optional public Client ID (empty by default)
│   │   ├── spotify/auth.js      OAuth + PKCE sign-in, token storage and refresh
│   │   ├── spotify/client.js    Spotify Web API requests and error handling
│   │   ├── spotify/playback.js  Playback state, polling, playback commands
│   │   ├── ui/nowplaying.js     Now Playing screen rendering and controls
│   │   ├── ui/settings.js       Settings sheet (account, devices, display)
│   │   └── wallpapers/library.js  UNUSED DRAFT for Phase 2 (nothing imports it)
│   └── nightstand/
│       ├── index.html           Nightstand page
│       ├── nightstand.css       Nightstand design
│       └── nightstand.js        Nightstand logic (clock, weather, calendar, photos)
├── docs/                        This documentation
├── .github/workflows/pages.yml  Automation that publishes app/ to GitHub Pages
├── .gitignore                   Files Git must never track
├── .gitattributes               Keeps line endings consistent (LF) across computers
├── README.md                    Project front page on GitHub
└── SECURITY.md                  How to report a vulnerability privately
```

## How to read a file's role

For any JavaScript file, look at:

1. **The `import` lines at the top**: what it depends on.
2. **The `export` lines**: what it offers to other files.
3. **Who imports it**: search the project for its file name.

| File | Imports | Imported by | If you removed it |
|---|---|---|---|
| `spotify/auth.js` | nothing | `client.js`, `main.js` | Sign-in and every Spotify request fail |
| `spotify/client.js` | `auth.js` | `main.js` (passed to playback and settings) | No Spotify data at all |
| `spotify/playback.js` | nothing (gets the client passed in) | `main.js` | The screen never updates; buttons do nothing |
| `ui/nowplaying.js` | nothing | `main.js` | The player stays blank |
| `ui/settings.js` | nothing | `main.js` | No settings sheet; the app fails to start because `main.js` imports it |
| `route.js` | nothing | `index.html` (plain script) | The Home Screen icon always opens Encore |
