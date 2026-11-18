# Architecture

_Last updated: 2026-11-18. Describes only what is implemented._

## The big picture

Encore is a **static web app**: a set of HTML, CSS and JavaScript files that a web server hands to the browser unchanged.
There is **no backend**, meaning no server of our own that runs code or stores data. The browser talks directly to outside services
(Spotify, Open-Meteo) over HTTPS.

```
            ┌──────────────────────────── iPad / browser ────────────────────────────┐
            │                                                                         │
            │   app/index.html  (Encore)            app/nightstand/index.html          │
            │     │ loads                              │ loads                         │
            │     ▼                                    ▼                               │
            │   js/route.js ── reopens last app ──▶ nightstand/nightstand.js           │
            │   js/main.js (wires everything)          (clock, weather, calendar,      │
            │     │                                     photos, night mode)            │
            │     ├─▶ ui/nowplaying.js ◀── state ──┐         │                         │
            │     ├─▶ ui/settings.js               │         │                         │
            │     │        │ commands              │         │                         │
            │     │        ▼                       │         │                         │
            │     └─▶ spotify/playback.js ─────────┘         │                         │
            │              │ (keeps local copy, polls)       │                         │
            │              ▼                                 │                         │
            │         spotify/client.js ─▶ spotify/auth.js   │                         │
            │              │ (API calls)      │ (tokens)     │                         │
            │   localStorage: settings · Client ID · tokens  │  localStorage + IndexedDB │
            └──────────────┼──────────────────┼──────────────┼─────────────────────────┘
                     HTTPS ▼            HTTPS ▼        HTTPS ▼
              api.spotify.com   accounts.spotify.com   api.open-meteo.com
                     │                                 geocoding-api.open-meteo.com
                     ▼
        Your Spotify device (app/phone/speaker) ── actually plays the audio
```

## Layers (Encore)

| Layer | Files | Responsibility | Knows about |
|---|---|---|---|
| Entry / wiring | `js/main.js`, `js/route.js` | Starts the app, connects modules, clock, wake lock | Everything |
| Interface (UI) | `js/ui/nowplaying.js`, `js/ui/settings.js` | Draws the screen from state; turns taps into commands | Playback layer |
| Playback state | `js/spotify/playback.js` | Local copy of "what's playing", polling, controls | Client |
| API client | `js/spotify/client.js` | Builds HTTPS requests, attaches the token, classifies errors | Auth |
| Authentication | `js/spotify/auth.js` | OAuth sign-in with PKCE, storing and refreshing tokens | Nothing else in the app |

**Dependencies point one way: UI → playback → client → auth.** The Spotify code never imports UI code,
so the interface can be redesigned without touching the integration. Cosmos wallpapers will be a separate `js/wallpapers/` module for the same reason.

## Key design decisions

| Decision | Why | Trade-off |
|---|---|---|
| Web app, not native Swift | No Mac needed; deploys by copying files | Can't run in the background; the iPad must stay unlocked |
| No backend | Nothing to host or secure server-side; free hosting | Tokens must live on the device (see SECURITY.md) |
| No framework or build step | Fewer moving parts and no third-party code to trust; you can read every line | More manual DOM code |
| Polling Spotify | The Web API has no push updates | A small delay (≤ 3 s) before outside changes appear |
| Music plays in the Spotify app, not the page | Spotify's in-browser player is unreliable on iPad and stops when it locks | Encore is a remote control plus a display |

## Not yet built

- Cosmos collection import and wallpaper rotation (Phase 2–3). `js/wallpapers/library.js` exists as an **unused draft**.
- Appearance options (blur, darkness, light mode, adaptive colors), offline caching, automated tests.
