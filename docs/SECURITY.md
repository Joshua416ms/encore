# Security design

_Last updated: 2026-11-18. To report a vulnerability, see [/SECURITY.md](../SECURITY.md)._

## What we protect

1. **Your Spotify tokens.** Whoever holds them can control your playback.
2. **Your location** (Nightstand weather), stored on your device.
3. **Your personal identity in the public repo** (Git commit email).

## Threats that apply to this architecture

| Threat (OWASP category) | Applies? | Status / protection |
|---|---|---|
| **XSS**, cross-site scripting (Injection) | Yes. Spotify and weather data appear on screen | Text from APIs is inserted with `textContent`, never as HTML. `innerHTML` is used only with fixed text or numbers checked with `Number()`. The **CSP** blocks injected scripts |
| **Token theft via XSS** (Cryptographic failures / Auth failures) | Yes. Tokens live in `localStorage`, which any script on the page can read | Defended by the XSS protections above. Tokens only grant playback control |
| **CSRF on sign-in** (Broken access control) | Yes | Random `state` value checked on return |
| **Authorization code interception** | Yes | PKCE: the code is useless without the verifier |
| **Excess permissions** (Broken access control) | Yes | 7 scopes: 2 for playback, 5 read-only for the Spotify screen; none can change your library (see AUTHENTICATION.md) |
| **Unsafe links from API data** | Yes. "Open Spotify" uses an API-provided URL | `safeSpotifyUrl()` only accepts `https://open.spotify.com/…` |
| **Vulnerable dependencies** | Minimal | No JavaScript libraries and (since the typography update) no external stylesheets or fonts. Encore loads only its own files plus Spotify images/API |
| **Untrusted image files** (photo import) | Yes. You import files from Files | Images are decoded by the browser's own image decoder (sandboxed) and only ever displayed as images: never parsed as HTML or run. File names are shown with `textContent`. Imports stay on the device |
| **Reading pixels of remote images** | Yes. Artwork mode samples cover colours | Only possible because Spotify's image server allows it (`Access-Control-Allow-Origin: *`); the image is loaded with `crossOrigin="anonymous"`, so no cookies are sent |
| **SQL injection** | No | There's no database server or SQL anywhere |
| **Clickjacking** (page embedded in another site) | Low | Can't be fully blocked on GitHub Pages: `frame-ancestors` only works as a server header, and Pages can't set custom headers. Accepted, low impact |
| **Lyrics text from LRCLIB** (Injection) | Yes, when lyrics are on | Only string fields are used, length-limited (20,000 chars), shown with `textContent`. The CSP allows exactly one new address (`https://lrclib.net`). No cookies or referrer are sent |
| **Spotify policy risk (lyrics)** | Accepted by the owner | Policy III.5 may cover lyrics from another service. Worst realistic case: Spotify disables the developer app. Off by default |
| **Sign-out by a refresh race** | Fixed 2026-11-19 | Spotify rotates refresh tokens. Two open tabs refreshing at once made the slower one get `invalid_grant` and sign out. Now it first checks whether another tab already stored a newer token |
| **Physical access** | Yes | Anyone with the unlocked iPad controls your playback. Use a passcode and Guided Access |
| **Secrets in Git history** | Yes, for a public repo | `.gitignore`; no secrets exist in the code; GitHub push protection (enable it) |

## Content Security Policy (CSP)

A CSP is a list in the page's `<meta>` tag telling the browser what the page may load or contact. Anything else is refused.

Encore's policy (`app/index.html`):

| Directive | Allowed | Effect |
|---|---|---|
| `default-src 'self'` | Our own files | Starting rule: everything else is denied |
| `script-src 'self'` | Only our own `.js` files | No inline scripts, no scripts from other sites. Injected `<script>` won't run |
| `connect-src` | `accounts.spotify.com`, `api.spotify.com`, `lrclib.net` (lyrics) | Even injected code couldn't send tokens anywhere else |
| `img-src` | Our files, Spotify image servers, `data:`, `blob:` | Album art loads; tracking images from elsewhere don't |
| `style-src 'self'` | Only our own CSS file | No injected stylesheets (Google Fonts removed 2026-11-18) |
| `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` | Nothing | Blocks plug-ins, `<base>` hijacking and form posting elsewhere |

Nightstand has its own policy that allows only Open-Meteo for `connect-src`. It also needs `style-src 'unsafe-inline'`, because it sets a few
inline `style=""` attributes (accent swatches, forecast bars). That's a small, accepted weakening for styles only; scripts remain strict.

**Verified 2026-11-18:** on Nightstand, a test request to `https://example.com` was blocked by the CSP, and Open-Meteo was allowed.
On Encore, even a request to its own server (`fetch('/js/…')`) is blocked, because `connect-src` lists only Spotify.
That is intended: the page never needs to fetch anything else.

## Secrets: rules for this repo

- The Client Secret is never needed. Never add it to any file.
- Never commit `.env` files, tokens, screenshots that show tokens, or exported browser storage.
- **If a secret is committed:** treat it as exposed, even if you delete it in the next commit, because it stays in Git history.
  Rotate it immediately: in the Spotify dashboard, use **Reset** for a Client Secret; remove app access at spotify.com/account/apps for tokens.
  Then clean the history or recreate the repo.

## Repository settings to keep on

- Settings → Code security: **Secret scanning**, **Push protection**, **Private vulnerability reporting**.
- Your GitHub account → Settings → Emails: **Keep my email addresses private** and **Block command line pushes that expose my email**.

## Prioritized checklist

| # | Item | Status |
|---|---|---|
| 1 | Project in a permanent folder with Git | Done |
| 2 | Commit email set to the GitHub noreply address | Done, verified in history |
| 3 | Spotify design rules (logo, link back, no blurred art, 8px corners, full text viewable) | Done |
| 4 | Least-privilege scopes (7; library ones read-only) | Done |
| 5 | CSP on both pages | Done, verified |
| 6 | Sign-in code always removed from the address bar | Done, verified |
| 7 | API URLs checked before use as links | Done |
| 8 | Weather values forced to numbers before display | Done |
| 9 | Remove the Google Fonts request | Done (system font only) |
| 10 | Real-account test of sign-in and live track info | Done 2026-11-18 (sign-in, track, artwork, device). Playback buttons not yet pressed in a test |
| 11 | Spotify rules in the new modes (whole cover in artwork mode, logo shown, ≤ 8 px corners, artwork or info always shown) | Done, verified |
