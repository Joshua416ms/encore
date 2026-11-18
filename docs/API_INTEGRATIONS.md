# API integrations

_Last updated: 2026-11-18._

An **API** (Application Programming Interface) is a set of addresses a service publishes so programs can ask it for data or actions.
Each request is an **HTTP request**: a *method* (GET = read, PUT/POST = change), an *address* (URL), *headers* (extra info like the token)
and sometimes a *body*. The reply has a *status code* (200 OK, 204 No Content, 401 Unauthorized, 404 Not Found, 429 Too Many Requests…).

## Spotify Web API (implemented)

Base address: `https://api.spotify.com/v1`. Every request carries `Authorization: Bearer <access token>`.

| What Encore does | Method + path | Scope needed | Premium? |
|---|---|---|---|
| Read what's playing, progress, device, shuffle/repeat | `GET /me/player` | `user-read-playback-state` | No |
| List devices | `GET /me/player/devices` | `user-read-playback-state` | No |
| Show account name | `GET /me` | none beyond sign-in | No |
| Play / pause | `PUT /me/player/play`, `PUT /me/player/pause` | `user-modify-playback-state` | **Yes** |
| Next / previous | `POST /me/player/next`, `/previous` | `user-modify-playback-state` | **Yes** |
| Seek | `PUT /me/player/seek?position_ms=` | `user-modify-playback-state` | **Yes** |
| Shuffle / repeat | `PUT /me/player/shuffle?state=`, `/repeat?state=` | `user-modify-playback-state` | **Yes** |
| Switch device | `PUT /me/player` | `user-modify-playback-state` | **Yes** |

**Error handling** (`client.js`): 401 → refresh the token once and retry. 429 → wait for `Retry-After` (10 s if the header can't be read).
403/404 → turned into a readable message (Premium required, no active device, restricted device).

**Polling** (`playback.js`): every 3 s while playing, every 8 s otherwise, 15 s after errors, never while the app is hidden.

**Rules we follow** (Spotify Developer Policy and Design Guidelines, checked 2026-11-18):
the official logo is shown next to Spotify content; an "Open Spotify" link goes to the current item; artwork is not blurred, cropped
or overlaid and has 8px corners; truncated text can be expanded by tapping it; the app name doesn't resemble "Spotify".

**Limits in Development Mode** (since Feb 2026): the app owner needs Premium, and at most 5 approved users per app.

## Open-Meteo (Nightstand weather, implemented)

| Purpose | Address | Key needed |
|---|---|---|
| Forecast | `https://api.open-meteo.com/v1/forecast` | No |
| City search | `https://geocoding-api.open-meteo.com/v1/search` | No |

Only the chosen latitude/longitude (or the search text) is sent. Responses are coerced to numbers before display.

## Cosmos (not implemented)

Verified on 2026-11-18: Cosmos (cosmos.so) publishes **no official API**. Third-party tools use undocumented internal endpoints,
which this project deliberately does not use. The planned approach is importing images you download from Cosmos via the iPad Files picker.
