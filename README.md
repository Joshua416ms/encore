# Encore

A full-screen iPad display with two switchable modes:

- **Encore**: a Now Playing screen for your Spotify account, with large album artwork, track details, a live progress bar and playback controls.
- **Nightstand**: a bedside clock with weather, an analog clock and calendar, a photo frame, and a red night mode.

It's a web app you add to the iPad Home Screen. There's no server, no build step and no third-party JavaScript.

> **Not affiliated with Spotify or Cosmos.** Spotify is a trademark of Spotify AB. This project uses Spotify's
> public Web API and follows Spotify's Developer Policy and Design Guidelines.

## Status

| Part | Status |
|---|---|
| Spotify sign-in, Now Playing, controls, device switching | Built. Being tested with a real account |
| Nightstand (clock, weather, calendar, photos, night mode) | Built and working |
| Cosmos wallpaper collections | Planned (Cosmos has no public API, so images will be imported from Files) |

## Requirements

- **Spotify Premium.** Spotify only allows playback control for Premium accounts.
- **Your own Spotify developer app** (free). It gives you a *Client ID*. You never need the Client Secret.
- A secure web address: `https://…`, or `http://127.0.0.1` while testing on your computer.

## Run it on your computer

```bash
python -m http.server 5173 --bind 127.0.0.1 --directory app
```

Then open http://127.0.0.1:5173/.

## Connect Spotify

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Add the Redirect URI that Encore shows on its Connect screen, for example `http://127.0.0.1:5173/` or your GitHub Pages address.
3. Tick **Web API**, save, and paste the **Client ID** into Encore.

Your sign-in is stored only in your own browser. Nobody who downloads this code gets access to your account.

## Host it on GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the `app/` folder. In the repository, go to **Settings → Pages**, set
**Source** to **GitHub Actions**, then push a change to `app/`. Add the resulting address as a Redirect URI in the Spotify dashboard.

## Documentation

How it works, step by step, is in [`docs/`](docs/). Start with [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

See [SECURITY.md](SECURITY.md) for how to report a problem privately.

## License

**All rights reserved.** This code is public so people can read and learn from it, but it isn't licensed for reuse,
modification or redistribution. Ask the author if you'd like to use part of it.

The Spotify logo in `app/assets/spotify/` is Spotify's trademark, used for attribution as Spotify's Design Guidelines require.
