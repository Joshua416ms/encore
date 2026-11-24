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

## 2026-11-19

**Grilled design, then built** (all recommendations accepted; lyrics: cover instead of "no lyrics" text)
- Lyrics (LRCLIB, off by default, own swipe mode, synced highlight + plain fallback, timing slider, on-device cache).
- Automatic screen switching; night mode (red, darker photos, smaller clock, cover untouched; brightness via Shortcuts);
  accent colour from the album art (green fallback); photos: pan & zoom without cropping, collections by time of day,
  hide photo, photo of the day.
- Tested: real LRCLIB lookup (58 synced lines), cache, not-found, highlight timing; 12 automatic-switching unit tests;
  accent from a real cover; night colours with the cover unfiltered; schedule window; pan & zoom limits; hide/restore;
  time-of-day switching; photo of the day.
- Bugs found and fixed: duplicate thumbnails (overlapping renders → "ticket"); a quick second Hide found nothing
  (current photo cleared too early); **race on fast taps** (a failed earlier load removed the newer photo's image →
  wrongly treated as broken); decode() never settling in a hidden page (fallback after 2.5 s);
  **refresh-token race between two tabs** signed the user out (now uses the newer token).
- Not tested yet on the iPad itself; lyrics with real playback (nothing was playing during tests).

**Settings trimmed, lyrics rule, vertical swipes, Spotify screen** (decided in a grilling session, then built)
- Music tab: removed Width, Minimum height, Padding, Background blur and Corner radius (decided after a visual
  low/default/high comparison). Fixed values in `FIXED`; old saved values deleted on load.
- Display tab: removed the Full screen button and the wake-lock status line; added a **Keep screen on** switch (default on).
- Lyrics screen exists only while the song has lyrics; automatic move to Album art and back (`returnToLyrics`).
- Swipe down → Spotify screen; swipe up → Nightstand (down to return). Removed both apps' Switch buttons.
- Spotify screen: now playing (large controls, volume), Up next, playlists, saved albums, recently played; song lists
  with a big Play; followed playlists show Play only. Five new read-only scopes; older sign-ins see "Reconnect Spotify".
- `tools/serve.py` accepts `PORT` (5173 was taken by another session's server).
- Tested in the browser: old widget values removed; Music/Display tab contents; swipes (edge zone ignored, down →
  Connect when signed out, up → Nightstand, Nightstand down → Encore, sideways unchanged); 6 lyrics-switching cases;
  Spotify screen with **sample data** (sections, dedupe, Show all, followed vs own vs collaborative playlist, local file
  disabled, play-from-song / Play / recently played requests, landscape and portrait layout, reconnect notice); no console errors.
- Not tested yet: a real Spotify account (new endpoints, `/playlists/{id}/items` response shape, volume), the iPad itself
  (real swipes near the screen edges, wake-lock switch).

**Sleep timer** (decided in a grilling session, Q1–Q8, then built)
- Moon button in the Spotify screen's top bar: Off, 15, 30, 45, 60 minutes; shows "28 min" while running.
- 30 s before the end the Spotify volume fades to 0 (only when the device allows volume), then pause, then the old
  volume is put back. Then a black sleep screen; Encore stops polling and lets go of the screen; tap to come back.
- The end time is stored in localStorage (`encore.sleepAt`), so the timer keeps running in Nightstand. Nightstand
  loads the same code (`js/sleep.js`) with `import()`; its CSP now allows Spotify.
- Nightstand now follows Encore's **Keep screen on** switch (it used to stay awake always).
- While a timer runs, the screen stays on even if the switch is off (Q8): a locked iPad freezes the page, so the
  timer could never stop the music.
- Tested in the browser: menu and label; end → black screen → tap back; the fade against a **fake Spotify**
  (60 → 45 → 30 → 15 → 0, pause, volume back to 60); Nightstand status texts and its sleep screen; no new console errors.
- Not testable here: the wake lock (this test browser refuses it), real Spotify, the iPad locking afterwards.

**Spotify screen fixes** (decided in a grilling session, S1–S6 in NEXT_STEPS, then built)
- The song list no longer slides sideways: `.lib-row` lost its negative margin and uses `box-sizing:border-box`;
  `.lib-scroll` has `overflow-x:hidden`.
- "Show all" no longer folds back by itself: `load()` and `refreshQueue()` now call `renderQueue()`, which redraws only
  Up next. The full column is drawn when the screen opens (so lists start at 12 again) and when you leave a playlist.
- "Show all" turns into "Show less" (folds back to 12 and scrolls the section title back into view if needed).
- Tap a song in Up next to jump to it: `playback.skip(n)` sends `POST /me/player/next` n times, one after the other.
- Tested in the browser with a **fake Spotify**: no sideways overflow (landscape and portrait); tapping the 3rd song sent
  exactly 3 "next" requests and Up next then started at the right song; "Show all" and the scroll position survived;
  Show less → 12 cards; reopening → 12 cards. No console errors from the app.
- Not tested yet: real Spotify (how fast several "next" calls in a row land), the iPad itself.
