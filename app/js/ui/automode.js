// Automatic screen switching: Encore picks the display mode for you, like iPad StandBy.
//   • Music playing                              → Album art (Lyrics also counts as a music screen: left alone)
//   • Paused/stopped for settings.autoPhotosAfter → Photos, or the Clock at night
//   • You chose a screen yourself (swipe/dot)     → automatic switching waits 30 minutes,
//                                                   or until the music starts/stops, whichever comes first
const OVERRIDE_MS = 30 * 60 * 1000;
const MUSIC_SCREENS = ["artwork", "lyrics"];

export function createAutoMode({ settings, modes, isNight }) {
  let playing = false;
  let lastPlayingAt = 0;        // when we last saw music playing (0 = not since the app opened)
  let overrideUntil = 0;

  function evaluate() {
    if (!settings.autoMode || Date.now() < overrideUntil) return;
    let target;
    if (playing) {
      if (MUSIC_SCREENS.includes(settings.mode)) return;          // already on a music screen
      target = "artwork";
    } else {
      const stoppedFor = lastPlayingAt ? Date.now() - lastPlayingAt : Infinity;
      if (stoppedFor < settings.autoPhotosAfter * 60000) return;  // just paused: give it a few minutes
      target = isNight() ? "clock" : "photos";
    }
    if (target !== settings.mode) modes.set(target, "auto");
  }

  /** Called with every playback update from Spotify (or null when not connected). */
  function onPlayback(state) {
    const now = !!(state && state.isPlaying && state.track);
    if (now) lastPlayingAt = Date.now();
    if (now !== playing) { playing = now; overrideUntil = 0; }    // music started/stopped: your earlier choice expires
    evaluate();
  }

  /** Called when you pick a screen yourself. */
  function onUserChoice() { overrideUntil = Date.now() + OVERRIDE_MS; }

  setInterval(() => { if (!document.hidden) evaluate(); }, 15000);

  return { onPlayback, onUserChoice, evaluate };
}
