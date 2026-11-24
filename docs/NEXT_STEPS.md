# Next steps (handoff)

_Written 2026-11-19 so a new chat can continue exactly where the last one stopped. Read this, then docs/ARCHITECTURE.md._

## State (2026-11-23)
- Decisions 1–9 below are built, committed (420216a) and confirmed on the iPad with a real Spotify account.
- Sleep timer (Q1–Q8 below) is committed (a3a1e93); still to try on the iPad.
- Spotify screen fixes (S1–S6 below) are built and tested in the browser with a fake Spotify; not committed yet; still to try on the iPad.
- Backlog next: "photo files and moods" (grill first).

## Decisions made (grilling session, 2026-11-19) — all built
1. **Lyrics screen only when the song has lyrics.** No lyrics → the Lyrics screen and its dot disappear.
   - If you were on Lyrics and a song without lyrics starts → move to Album art **automatically**.
   - Remember that move: when a later song HAS lyrics → **return to Lyrics**.
   - If you chose Album art yourself → stay there, even when the next song has lyrics.
   - Any swipe/dot tap of your own **clears** the "return to Lyrics" memory.
   - While the next song's lyrics load (~0.5 s), the Lyrics screen **keeps showing what it showed**; then one transition
     straight to the new lyrics or to Album art (no in-between cover).
2. **Vertical swipes** (horizontal swipes stay: Photos · Album art · Lyrics · Clock):
   - **Swipe DOWN → Spotify screen** (a panel from above; swipe UP to close it). Works from all four screens; closing returns
     to the screen you came from.
   - **Swipe UP → Nightstand** (swipe DOWN in Nightstand to come back).
   - Swipes must start away from the top/bottom screen edges (iPad system gestures live there).
3. **Remove the Nightstand "Switch" buttons** from both apps' Settings. No hint in the app; document the gesture in README/docs.
4. **Spotify screen contents:** now playing with large controls + volume slider; Up next (queue); your playlists; saved albums;
   recently played. **No search** for now. **No "+ Queue" button** for now (maybe later).
   - Tapping an album/playlist opens its track list with a big Play button; tapping a track plays from there.
   - Followed / Spotify-made playlists: Spotify returns 403 for their items → show cover, name and Play only.
5. **New Spotify scopes (read-only), reconnect once:** `playlist-read-private`, `playlist-read-collaborative`,
   `user-library-read`, `user-read-recently-played`, `user-read-currently-playing` (queue).
6. **Music tab cuts (Q12, decided 2026-11-19 after a visual low/default/high comparison):** remove Width, Minimum height,
   Padding, Background blur (widget) and Corner radius from Settings. Remaining widget controls: Overall size, Position,
   Background darkness. (How the cut values behave internally is still an open question below.)
7. **Photos tab (Q13):** keep "Darken everything" and "Pan and zoom amount" **for now** — no Photos cuts.
8. **Display tab (Q14):** remove the **Full screen button** (README says "Add to Home Screen" instead). Replace the
   "Keep screen on" status line with a **switch** "Keep screen on" (new setting, default On). Off → release the wake lock and let
   the iPad sleep normally. (Assumed, not yet confirmed: if it's On but iOS refuses, show a short toast instead of a status line.)
9. **Cut settings (Q15): snap to defaults.** The code always uses wWidth 400, wHeight 0 (Auto), wPad 14, wBlur 24,
   artRadius 8; on load, delete any saved values for those keys so old customisations disappear. Resizing stays via − / +.
   Removed with the Full screen button: nothing to store.

## Spotify API facts (verified 2026-11-19, Development Mode)
- `GET /me/playlists` (50 max/page). Items: `GET /playlists/{id}/items` (old `/tracks` removed) — **only own/collaborative playlists**.
- `GET /me/albums`, `GET /me/tracks` still exist (only save/remove moved to `/me/library`).
- `GET /me/player/recently-played` (cursors), `GET /me/player/queue`, `PUT /me/player/play` with `context_uri` + `offset`.
- `GET /albums/{id}/tracks` (bulk `GET /albums?ids=` removed). Search: max 10 results.
- Design rules for the library view: full Spotify logo (≥70 px) + link back; artwork unaltered, ≤8 px corners.

## Spotify screen fixes (grilling session, 2026-11-23) — built
- S1. **No sideways sliding.** Song rows were 16 px too wide (`width:100%` plus a negative margin), so the list scrolled
  sideways. Rows now fit; the list also has `overflow-x:hidden`.
- S2. **"Show all" no longer resets.** Only the Up next section is redrawn when the queue arrives or the song changes;
  playlists, albums and the scroll position stay.
- S3. **Tap a song in Up next → jump to it**, like the Spotify app: one "next" per song before it. Rejected: play only that
  song (loses the rest of the queue); play the context from an offset (the queue isn't always one playlist).
- S4. **"Show all" ↔ "Show less".** Lists fold back to 12 each time the Spotify screen opens (not remembered).
- S5. **Up next stays at 10 songs** (at most 10 skips; keeps playlists near the top).
- S6. The tapped row lights up at once; Up next refreshes after the jump; a failure shows a short message.

## Sleep timer decisions (grilling session, 2026-11-19) — built
- Q1 Moon button in the Spotify screen's top bar only. Q2 Off / 15 / 30 / 45 / 60 min.
- Q3 Last 30 s: volume fades to 0, pause, old volume back. No volume control on the device → just pause.
- Q4 Then black screen; Encore lets go of the screen; the iPad locks after Auto-Lock. Tap = back, music stays paused.
- Q5 Timer keeps running in Nightstand and ends there too. Q6 Nightstand follows Encore's "Keep screen on" switch.
- Q7/Q8 Timer works whatever the switch says; while it runs the screen stays on (a locked iPad freezes the page).

## Backlog (user's choices, 2026-11-19)
- **Next big one — photo files and moods** (grill first): save/load each collection as a file in Files (also the
  backup); built-in mood presets such as "Cosmic" or "Dark" (NASA images are free to use; Cosmos images are not).
  Multiple collections + time-of-day collections already exist (`ui/photos.js`).
- **Alarm:** a web app can't wake a locked iPad. Plan: a short guide for an iPad Shortcuts "Time of Day" automation
  that plays a Spotify playlist and opens Encore. Test on the iPad.
- Later, one at a time: Settings visual design. Maybe later: "+ Queue", search.
- Rejected: login (photos already stay on the device), Like ♥, favourite photos. Skipped: song line in Nightstand.

## How we work
- The user is learning: explain what changes and why; follow the mentor rules (see LEARNING_LOG.md).
- Test before claiming it works; snapshot and restore the user's settings when testing; use a separate browser tab.
- Ask before committing/deploying (the user says "commit and deploy").
