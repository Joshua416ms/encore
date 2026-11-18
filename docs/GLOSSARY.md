# Glossary

Each term includes where it appears in this project.

**Access token**: A short-lived pass (about 1 hour) sent with every Spotify request to prove permission. _Ours: created in `auth.js`, used in `client.js`._

**API**: A set of addresses a service publishes so programs can request data or actions. _Ours: Spotify Web API, Open-Meteo._

**Authentication / Authorization**: Proving who you are / deciding what you're allowed to do. _Spotify sign-in / scopes._

**Backend**: Code running on a server you control. _We have none; the app is static files._

**Client ID**: The public identifier of your Spotify developer app. Not a secret.

**Client Secret**: A private password for a Spotify app, used by server-side apps. _Encore doesn't use one; never add it._

**Commit**: A saved snapshot of the project in Git, with a message and author. Public on a public repo, including the author email.

**CSP (Content Security Policy)**: Browser-enforced rules for what a page may load or contact. _A `<meta>` tag in both `index.html` files._

**CSRF (Cross-Site Request Forgery)**: Another site tricking your browser into an action you didn't intend. _Blocked at sign-in by the `state` check._

**DOM**: The browser's live, in-memory version of the page that JavaScript reads and changes. _`document.getElementById(...)`._

**Endpoint**: One specific API address, such as `GET /me/player`.

**ES module**: A JavaScript file that shares code with `export` and receives it with `import`. _All of `app/js/` except `route.js`._

**GitHub Actions / workflow**: Automation that GitHub runs on its own machines. _`.github/workflows/pages.yml` publishes `app/`._

**GitHub Pages**: Free static website hosting from a GitHub repository.

**HTTPS / TLS**: HTTP encrypted with TLS, so nobody between you and the server can read or alter the traffic. Every external request in this app uses it.

**IndexedDB**: A browser database for larger data like images. _Nightstand photos._

**innerHTML vs. textContent**: `innerHTML` treats text as HTML (it can create elements and scripts); `textContent` treats it as plain text. _We use `textContent` for anything from an API._

**Least privilege**: Ask for and grant only the access you actually need. _Two Spotify scopes._

**localStorage**: Simple key → text storage in the browser, separate for each site. _Settings and tokens._

**OAuth 2.0**: The standard way to let an app act on your account without giving it your password.

**Optimistic update**: Updating the screen before the server confirms, and undoing it on failure. _`command()` in `playback.js`._

**OWASP Top 10**: A widely used list of the most common web application security risks.

**PKCE**: An OAuth extension that makes an intercepted sign-in code useless without a secret verifier kept in the browser.

**Polling**: Asking a server for updates on a timer, because it can't push them. _`sync()` in `playback.js`._

**Rate limiting / 429**: A service telling you you're making too many requests. _`client.js` backs off._

**Redirect URI**: The exact address Spotify sends you back to after sign-in. Must be registered in the dashboard.

**Refresh token**: A long-lived pass used to get new access tokens without signing in again.

**Repository (repo)**: A project folder tracked by Git, including its full history.

**Rotate (a secret)**: Replace an exposed secret with a new one so the old one stops working.

**Scope**: A named permission an app requests from Spotify, such as `user-modify-playback-state`.

**State (OAuth parameter)**: A random value sent at sign-in and checked on return, which defends against CSRF.

**State (application)**: The data the app currently holds that the screen is drawn from. _`playback.state`._

**Static site**: A website made of files served as they are, with no server-side code.

**XSS (Cross-Site Scripting)**: Getting your own script to run inside someone else's page, for example via unsanitized text inserted as HTML.
