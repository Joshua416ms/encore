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

**Photo-frame redesign + display modes** (two requests, built together)
- First real sign-in with the owner's Premium account: connected; live track, artwork and device shown.
- New: `wallpapers/importer.js`, `wallpapers/engine.js`, `ui/layout.js`, `ui/photos.js`, `ui/modes.js`, `ui/artmode.js`, `tools/serve.py`.
  Rewritten: `index.html`, `css/app.css`, `ui/settings.js`, `main.js`. Small change: `ui/nowplaying.js` (`onTrack` callback). Spotify code unchanged.
- Tested in the browser (real Spotify account, synthetic photos), including:
  import of 4 photos and duplicate detection; focal points and corner brightness; widget darker over bright photos (0.67 vs 0.38);
  swipe rules (play button, slow drag, vertical drag, last mode, dots); artwork mode (640×640 cover, uncropped, edge colours, logo link);
  clock mode; +/− from 80% to 180% with proportional sizes; independent sliders and auto-stacking; press-and-hold drag to a corner;
  persistence after reload (mode, size, position, current photo); 1180×820, 1366×1024 and 820×1180 screens; long titles.
- Bugs found and fixed while testing: clock unreadable over bright photos; title too small at 70%; progress bar floating; widget touching the dots.
- Not tested yet: pressing the playback buttons (to avoid interrupting the owner's music), and the deployed version on the iPad itself.

**Whole photos + blurred extension; album-art spacing**
- Photos: each slide = sharp whole photo (sized to its own aspect ratio, `contain`) + blurred 360 px thumbnail + darkening + vignette.
- Album-art mode: cover = short side minus a `vmin` margin (default 9%); background colours from the cover or black (no blur: Spotify rule).
- New settings: photo size, blurred background on/off, blur, background darkness, vignette, transition length (0.5–6 s), album-art spacing and background.
- Tested: portrait/landscape/square/panorama photos at 1180×820 and 820×1180 (ratios exact, fully on screen); broken photo skipped;
  album-art margins 1.42 cm (11" Air), 1.77 cm (12.9" Pro), 1.04 cm (mini portrait); every new setting applies live and persists.
- **Bug found and fixed:** the old photo was freed on a fixed timer; when animations were paused (hidden tab) the visible slide lost
  its image (blank screen). Now freed only after the new slide has fully faded in; per-slide URL tracking prevents leaks.

**Free dragging of the widget**
- Widget + −/+ buttons moved into one dock positioned by fractions `wX`/`wY`; press-and-hold 0.4 s, follow finger, clamp to screen,
  snap within 32 px of a corner; Settings presets glide to corners; "Custom (dragged)" option; clock moves away if covered.
- Tested (simulated touch): presets, middle, past every edge (clamped), corner snap; holds on play/next/progress bar/logo never drag;
  quick flick = mode swipe, not a drag; resizing 80–180% keeps the position fractions; reload restores the position; rotation re-fits and returns.
- Found and fixed: clock placement depended on an animation frame (never ran in a hidden page) → now immediate.
- Not tested yet: dragging with a real finger on the iPad.
