# API integrations

_Last updated: 2026-11-19._

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
| Volume (Spotify screen) | `PUT /me/player/volume?volume_percent=` | `user-modify-playback-state` | **Yes** |
| Play a playlist/album, optionally from one song | `PUT /me/player/play` with `context_uri` (+ `offset.uri`) | `user-modify-playback-state` | **Yes** |
| Play one song (Recently played) | `PUT /me/player/play` with `uris` | `user-modify-playback-state` | **Yes** |
| Up next | `GET /me/player/queue` | `user-read-currently-playing`, `user-read-playback-state` | No |
| Your playlists | `GET /me/playlists` (50 per page, up to 4 pages) | `playlist-read-private`, `playlist-read-collaborative` | No |
| A playlist's songs | `GET /playlists/{id}/items`: **only playlists you own or collaborate on** (others: 403) | same | No |
| Saved albums | `GET /me/albums` | `user-library-read` | No |
| An album's songs | `GET /albums/{id}/tracks` | none beyond sign-in | No |
| Recently played | `GET /me/player/recently-played?limit=30` | `user-read-recently-played` | No |

The Spotify screen only **reads** your library. There is no search and no "add to queue" (decided 2026-11-19; maybe later).
Followed and Spotify-made playlists show cover, name and **Play** only, because Spotify refuses to list their songs
to apps in Development Mode. Playlist items may come back as `item` (new) or `track` (old); `library.js` accepts both.

**Error handling** (`client.js`): 401 → refresh the token once and retry. 429 → wait for `Retry-After` (10 s if the header can't be read).
403/404 → turned into a readable message (Premium required, no active device, restricted device).

**Polling** (`playback.js`): every 3 s while playing, every 8 s otherwise, 15 s after errors, never while the app is hidden.

**Rules we follow** (Spotify Developer Policy and Design Guidelines, checked 2026-11-18):
the official logo is shown next to Spotify content; an "Open Spotify" link goes to the current item; artwork is not blurred, cropped
or overlaid and has 8px corners; truncated text can be expanded by tapping it; the app name doesn't resemble "Spotify".

**Limits in Development Mode** (since Feb 2026): the app owner needs Premium, and at most 5 approved users per app.

## LRCLIB (lyrics, implemented — off by default)

| | |
|---|---|
| Endpoint | `GET https://lrclib.net/api/get?track_name=…&artist_name=…&album_name=…&duration=…` (seconds; must match ±2 s) |
| Key | None. Apps must identify themselves: Encore sends `Lrclib-Client: Encore (https://github.com/Joshua416ms/encore)` (browsers can't set User-Agent; LRCLIB's CORS allows this header — checked 2026-11-19) |
| Sent | Song title, **main** artist, album name, length. Nothing else (no cookies: `credentials: "omit"`, no referrer) |
| Returns | `syncedLyrics` (LRC text with `[mm:ss.xx]` timestamps), `plainLyrics`, `instrumental`; **404** when not found |
| Limits | About 45–90 requests/min per IP; we look each song up once and cache it (IndexedDB `encore-lyrics`, max 200 songs) |
| Not cached | Network errors, 429 (busy) and server errors, so they are retried next time |
| Licensing | **Not documented.** Lyrics are community-contributed; LRCLIB claims no publisher licence |

**Spotify's position** (verified 2026-11-19): Spotify's public Web API has no lyrics. Spotify Developer Policy **III.5**:
"Do not create any product or service which is integrated with streams or content from another service." Lyrics from
another service, timed to Spotify playback, may fall under this. The owner accepted this risk for personal use (see SECURITY.md).

## Open-Meteo (Nightstand weather, implemented)

| Purpose | Address | Key needed |
|---|---|---|
| Forecast | `https://api.open-meteo.com/v1/forecast` | No |
| City search | `https://geocoding-api.open-meteo.com/v1/search` | No |

Only the chosen latitude/longitude (or the search text) is sent. Responses are coerced to numbers before display.

**Cover images** (`https://i.scdn.co/…`): the largest size Spotify provides is **640 × 640 px**, so artwork mode upscales it on
an iPad screen. The image server sends `Access-Control-Allow-Origin: *` (checked 2026-11-18), which allows the artwork mode to read
the cover's edge colours.

## Cosmos (import from Files, implemented)

Verified on 2026-11-18: Cosmos (cosmos.so) publishes **no official API**. Third-party tools use undocumented internal endpoints,
which this project deliberately does not use.

**What is implemented instead:** download images in Cosmos (each image's **Download** option), save them to a folder in Files, then
in Encore go to **Settings → Photos**, name a collection and choose the photos. Encore stores a screen-sized copy, a thumbnail and some
analysis (focal point, corner brightness) in IndexedDB on the device. Adding the same original file again is detected (SHA-256) and skipped.
Nothing is uploaded anywhere.
