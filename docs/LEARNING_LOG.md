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
