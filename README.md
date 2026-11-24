# Encore

A full-screen iPad photo frame with a Spotify music widget. Swipe **left and right** between the display modes:

1. **Photos**: your own photo collections (for example images saved from Cosmos) rotate full screen, with a resizable Spotify widget and clock in the corners.
2. **Album artwork**: the current Spotify cover, as large as the screen allows.
3. **Player**: the whole cover on the left; the song, a seek bar and the playback controls (with shuffle and repeat) on the right, on a dark tint taken from the cover.
4. **Lyrics** (optional): only while the current song has lyrics.
5. **Clock**: large time and date.

Swipe **down** for the **Spotify screen**: big playback controls, volume, Up next, your playlists, saved albums and
recently played. Tap a song in Up next to jump to it. Swipe **up** to close it.

In the Spotify screen, the **moon** button starts a **sleep timer** (15–60 minutes): the music fades out and pauses,
the screen goes black, and the iPad locks by itself. Tap the black screen to come back.

Swipe **up** (from any screen) for the separate **Nightstand** app (clock, weather, calendar, photo frame, red night mode);
swipe **down** there to come back. Start vertical swipes a little away from the top and bottom edges, which belong to iPadOS.

For the real full-screen look, open Encore from its **Home Screen icon** (Safari > Share > Add to Home Screen).

It's a web app you add to the iPad Home Screen. There's no server, no build step and no third-party JavaScript.

> **Not affiliated with Spotify or Cosmos.** Spotify is a trademark of Spotify AB. This project uses Spotify's
> public Web API and follows Spotify's Developer Policy and Design Guidelines.

## Status

| Part | Status |
|---|---|
| Spotify sign-in, live track info, widget | Built and tested with a real account |
| Photo collections (import from Files), rotation, display modes | Built and tested in the browser |
| Nightstand (clock, weather, calendar, photos, night mode) | Built and working |
| Player screen (cover + controls) | Built and tested in the browser with sample data; not yet with a real account or on the iPad |
| Lyrics (optional, off by default) | Built and tested; community-sourced via LRCLIB |
| Spotify screen (swipe down), vertical swipes | Built and tested in the browser with sample data; not yet with a real account |
| Automatic screen switching, night mode, accent colours, photo extras | Built and tested in the browser |
| Sleep timer (moon button); Nightstand follows "Keep screen on" | Built and tested in the browser with a simulated Spotify; not yet on the iPad |
| Direct Cosmos account connection | Not possible: Cosmos has no public API. Photos are imported from Files instead |

## Requirements

- **Spotify Premium.** Spotify only allows playback control for Premium accounts.
- **Your own Spotify developer app** (free). It gives you a *Client ID*. You never need the Client Secret.
- A secure web address: `https://…`, or `http://127.0.0.1` while testing on your computer.

## Run it on your computer

```bash
python tools/serve.py
```

Then open http://127.0.0.1:5173/. If that port is busy, set `PORT` first (PowerShell: `$env:PORT=5175`).

## Connect Spotify

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Add the Redirect URI that Encore shows on its Connect screen, for example `http://127.0.0.1:5173/` or your GitHub Pages address.
3. Tick **Web API**, save, and paste the **Client ID** into Encore.

Your sign-in is stored only in your own browser. Nobody who downloads this code gets access to your account.

## Host it on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the `app/` folder. In the repository, go to **Settings → Pages**, set
**Source** to **GitHub Actions**, then push a change to `app/`. Add the resulting address as a Redirect URI in the Spotify dashboard.

## Open automatically when charging

1. Open the Encore home page in **Safari**, tap **Share**, then **Add to Home Screen**. The icon reopens whichever app you used last.
2. Open the **Shortcuts** app, go to **Automation**, tap **+**, choose **Charger** and **Is Connected**.
3. Set it to **Run Immediately**, add the **Open App** action, and pick **Encore**.
4. Turn the iPad on its side. Swipe left and right to change views; tap to show the controls.

## Documentation

How it works, step by step, is in [`docs/`](docs/). Start with [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

See [SECURITY.md](SECURITY.md) for how to report a problem privately.

## License

**All rights reserved.** This code is public so people can read and learn from it, but it isn't licensed for reuse,
modification or redistribution. Ask the author if you'd like to use part of it.

The Spotify logo in `app/assets/spotify/` is Spotify's trademark, used for attribution as Spotify's Design Guidelines require.
