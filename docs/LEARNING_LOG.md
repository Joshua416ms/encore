# Learning log

## Session 1: 2026-11-18

### Built
- Encore Phase 1: Spotify sign-in, Now Playing, controls, device switching.
- Nightstand merged in as a second, switchable app.
- A security pass before publishing to a public GitHub repo.

### Concepts introduced
- Static web app vs. native app vs. backend; ES modules; one-way dependencies between layers.
- HTTP requests: methods, status codes, headers, `Authorization: Bearer`.
- OAuth 2.0, PKCE, the `state` parameter, access vs. refresh tokens, scopes, least privilege.
- Polling, optimistic updates, local progress interpolation.
- `localStorage` and IndexedDB, and why each site's storage is separate.
- XSS, `innerHTML` vs. `textContent`, Content Security Policy, validating URLs from APIs.
- Public configuration (Client ID) vs. secrets (Client Secret, tokens); rotating an exposed secret.
- Git commit metadata exposes your email; GitHub noreply addresses.
- Following a platform's terms (Spotify Design Guidelines) as part of shipping.

### Errors and how they were solved
| Error | Cause | How we found it | Fix |
|---|---|---|---|
| Python server: `WinError 10013` on port 8888 | Windows reserves some ports | Read the traceback's last line | Used port 5173 |
| `ERR_CONNECTION_REFUSED` in console | A page load interrupted by a reload (not a bug) | Network list: the final load was all 200 OK | None needed |
| `?code=` left in the address bar | Redirect handling skipped when no Client ID was stored | A deliberate test with a fake `?code=` | Always strip first in `handleRedirect()` |
| Code folder `app/js/wallpapers/` silently ignored by Git | `.gitignore` pattern `wallpapers/` matches that name at any depth | `git status --short --ignored` before the first commit | Anchored it: `/wallpapers/` |
| "LF will be replaced by CRLF" warnings | Windows and Unix use different line-ending characters | Read the warning text | Added `.gitattributes` (`* text=auto eol=lf`) |
| New design didn't appear; new files returned 404 | The preview server was running from the **old** project folder | Server log showed 404s; `Get-NetTCPConnection` + the preview list showed its working folder | Ran `tools/serve.py` from the project folder |
| Still the old page after fixing the server | **Browser cache**: old files counted as "fresh" | The server log showed the browser never asked for the files | Re-downloaded with `fetch(..., {cache:"reload"})`; `tools/serve.py` sends `Cache-Control: no-store` |
| `fetch('/js/main.js')` failed inside Encore | Our own **CSP** only allows connections to Spotify | Error was "Failed to fetch" in the page; worked from a non-HTML file | Not a bug: the policy working as designed |
| Clock unreadable over a white photo | White text + shadow isn't enough on bright backgrounds | Zoomed screenshot during testing | Frosted backing when that corner is bright |
| Title too small at minimum widget size | 0.7 × 16 px = 11.2 px | Measured `fontSize` while pressing − | Minimum raised to 0.8 (12.8 px) |
| Progress bar floating far above the controls | The wrong grid row was set to stretch | Screenshot with tall artwork | Progress row stretches; bar sits on the controls |
| Wide widget in a bottom corner touched the mode dots | Bottom slots didn't reserve the dots row | Compared `getBoundingClientRect()` of both | Bottom slots sit 28 px higher |
| Blank screen between photos (in a hidden tab) | Old photo freed on a **fixed timer** while the fade was paused | Sampled both slides' opacity and `src` several times during a fade | Free only after the new slide's fade-in is confirmed |
| Screenshots/measurements "one step behind" | The browser pane was hidden → 0 animation frames → CSS transitions frozen mid-way | `requestAnimationFrame` counter = 0; `document.getAnimations()` listed running transitions | Tests call `animation.finish()` before measuring |
| Test-only `<style>` had no effect | Our own CSP (`style-src 'self'`) blocks injected styles | Computed `transition` was unchanged | Not a bug: the policy works; used the Web Animations API instead |
| Clock never placed in a corner (hidden page) | Placement waited for an animation frame | Clock's parent was not a corner slot | Place it immediately; re-check on `transitionend` |

| Duplicate thumbnails | Two overlapping async renders both appended | Counted list items after hiding one photo | "Ticket" per render; stale renders stop |
| Fast taps dropped a good photo | A superseded load's cleanup removed the newer image | Double-tap test; reasoned through the event order | Clean up only your own image (`fg.src === myUrl`) |
| Signed out of Spotify locally | Two tabs refreshed with the same rotating refresh token | Token missing after tests; traced the only code path that deletes it | Re-read storage before signing out |

## Session 4: 2026-11-19 — grilling, lyrics, automation, night, photos

### Concepts introduced
- Stress-testing a design with a decision tree ("grilling") before writing code.
- Reading platform policy (Spotify III.5) and making an explicit, documented risk decision.
- CORS preflight requests and allowed custom headers; LRC timestamp format; binary search.
- Race conditions in async code: tickets, "is this still mine?" checks, token rotation across tabs.
- State machines with time (automatic switching), and unit-testing them with a fake clock.

### Questions you should be able to answer
18. Why does the lyrics feature carry a policy risk, and what limits the damage if Spotify objects?
19. What does a CORS preflight check, and why did we test it before building the lyrics client?
20. Two fast taps on › once made a good photo disappear from rotation. Explain the race in your own words.
21. Why can two open tabs sign you out of Spotify, and how does the fix avoid it?

## Session 3: 2026-11-18 — photo display and dragging

### Concepts introduced
- `object-fit: contain` vs `cover`; `aspect-ratio`; why a blurred *thumbnail* is as good as a blurred full image.
- CSS transitions and their events (`transitionend`); why timers are a poor proxy for "the animation finished".
- Hidden pages: no animation frames, slowed timers, no `resize` events until visible.
- Object URL lifetime and memory leaks; tracking resources per owner.
- Storing positions as fractions (resolution- and orientation-independent).
- Gesture disambiguation: tap vs. swipe vs. press-and-hold drag; pointer capture.

### Questions you should be able to answer
14. Why does the blurred background use the 360 px thumbnail instead of the full photo?
15. Why is "wait 2.6 s, then free the old photo" unsafe, and what does the app do instead?
16. Why is the widget's position saved as fractions instead of pixels? What happens when you rotate the iPad?
17. How does the app decide whether a touch on the widget is a tap, a swipe or a drag?

## Session 2: 2026-11-18 — photo frame, modes, widget

### Built
- Photo import from Files (Cosmos has no API), on-device library, rotating wallpaper engine.
- Spotify player turned into a corner widget with independent sizing, drag-to-corner and +/− resizing.
- Three display modes (photos + widget, full-screen artwork, clock) with swipe and dots.
- One-font typography system; Google Fonts removed.

### Concepts introduced
- CSS custom properties as a bridge between settings (JavaScript) and layout (CSS).
- CSS grid areas; switching layouts with a class (`stacked`, `no-art`).
- IndexedDB vs. localStorage; Blobs and object URLs (and releasing them to free memory).
- Hashing (SHA-256) for duplicate detection; image downscaling with canvas.
- Pointer Events; telling a tap, a swipe, a slow drag and a press-and-hold apart.
- CORS: why the page may read Spotify cover pixels but not every image.
- Browser caching and `Cache-Control`; how to check which server is really answering.
- Debouncing saves; a schema-driven settings UI.

### Questions you should be able to answer
8. Why does changing the artwork size not change the text size? Which file sets each value?
9. What is the difference between the − / + buttons and the individual sliders?
10. How does the app tell a swipe from a tap on the play button?
11. Why does artwork mode show the whole cover instead of filling the screen?
12. Why are photos stored in IndexedDB and not localStorage? What would happen to memory if object URLs were never revoked?
13. A change you made doesn't show up in the browser. What three things do you check, in what order?

### Questions you should be able to answer
1. Why doesn't Encore need a Client Secret, and what does PKCE do instead?
2. What does the `state` value protect against, and how?
3. If an access token leaked but the refresh token didn't, how long would an attacker have?
4. Why is text from Spotify put on screen with `textContent` and not `innerHTML`?
5. What would the CSP do if someone injected `<script src="https://evil.example/x.js">` into the page?
6. You committed a secret and deleted it in the next commit. Is it safe now? What do you do?
7. Why does Encore poll Spotify, and what stops it from polling too often?

### Suggested further study
- MDN Web Docs: *Using Fetch*, *Content Security Policy*, *Window.localStorage*.
- OAuth 2.0 for Browser-Based Apps (IETF best-current-practice draft).
- OWASP Top 10: A01 Broken Access Control, A03 Injection, A07 Identification and Authentication Failures.
- Pro Git book, chapters 1–2 (free online).
