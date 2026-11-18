# Development log

## 2026-11-18

**Nightstand (first prototype)**
- Single-page bedside display: big clock, analog clock and calendar, photo frame (IndexedDB), red night mode, keep-awake, then a weather view (Open-Meteo).
- Verified: live weather requests succeed when served from a normal web address. They are blocked inside claude.ai previews.

**Research**
- Spotify (Feb 2026 Developer Mode changes): owner needs Premium; 5 users max; player endpoints unchanged; PKCE required; `localhost` redirect URIs are banned and `127.0.0.1` is allowed.
- Cosmos: no official public API. Unofficial tools exist; we chose not to use them.
- iPadOS: Wake Lock works in Home Screen web apps from iOS/iPadOS 18.4 (secondary sources).

**Encore Phase 1 (Spotify)**
- Added `auth.js` (PKCE), `client.js`, `playback.js`, `nowplaying.js`, `settings.js`, `main.js`.
- Verified: connect screen and layout render with no console errors. **Not yet tested with a real Spotify account.**

**Pre-publication security pass**
- Removed the unused scope `user-read-currently-playing`.
- Spotify design compliance: removed the blurred album-art background; artwork corners set to 8px with no zoom; added the official logo and an "Open Spotify" link (`safeSpotifyUrl()`); text expands on tap.
- Added a CSP to both pages. Moved Nightstand's inline script and CSS into files so `script-src 'self'` works.
- Bug found by testing: when no Client ID was stored, `?code=` stayed in the address bar. Fixed in `handleRedirect()`, then verified.
- Weather values are now coerced to numbers before they reach `innerHTML`.
- Merged Nightstand into `app/nightstand/` with Switch buttons and "reopen last app" (`route.js`). Verified both directions.
- Added README, SECURITY.md, `.gitignore`, the Pages workflow and `docs/`.

**Git setup**
- Moved the project to a permanent folder; `git init -b main`.
- Review before the first commit caught an over-broad `.gitignore` pattern (fixed) and added `.gitattributes` for consistent LF line endings.
- Scanned the staged content for secrets: none found.

**Published**
- Public repo: github.com/Joshua416ms/encore. Full-history scan before pushing: no secrets, only the noreply email.
- Signed Git in with the GitHub device flow (the pop-up window didn't appear; the device code worked).
- GitHub Pages source set to GitHub Actions. The first automatic run failed (Pages wasn't enabled yet); a manual run succeeded.
- Verified live at https://joshua416ms.github.io/encore/: HTTPS, CSP present, no console errors, Nightstand reachable, `docs/` not published (404).
