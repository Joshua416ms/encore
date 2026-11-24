# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One person (the author), at home. The iPad sits on a stand like an iPad StandBy screen and is mostly looked at from
across the room, then touched now and then to change the music or the photo.

## Product Purpose
Encore is a photo frame first, with Spotify on top: it shows the user's own photos full screen, shows what's playing on
Spotify, and controls it. Success: it can stay on all day and night and always look calm and good, and the music is one
swipe or tap away.

## Operating Context
- Opened from the iPad Home Screen as a full-screen web app; landscape on a stand.
- Screens reached by horizontal swipes (Photos, Album art, Player, Lyrics, Clock); swipe down for the Spotify screen,
  swipe up for the separate Nightstand app.
- Automatic switching: music playing shows a music screen; stopped shows photos, or the clock at night.
- Red night mode on a schedule.

## Capabilities and Constraints
- Static web app: no server, no build step, no third-party JavaScript; strict Content Security Policy.
- Spotify Web API with the user's own Client ID; Premium needed for playback control. Library access is read-only
  (no liking or saving songs).
- Spotify Design Guidelines: the cover is never cropped, blurred or covered, and the Spotify logo is shown and links
  back to Spotify.
- Lyrics come from LRCLIB (community), optional.

## Brand Commitments
Name: Encore. Not affiliated with Spotify or Cosmos.

## Product Principles
- Readable from across the room; calm when untouched.
- Controls appear only where they earn their place.
- Follow Spotify's rules exactly.
- Nothing leaves the device except calls to Spotify and LRCLIB.
