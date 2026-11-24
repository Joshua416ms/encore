// Player screen: the whole album cover on the left; the song, a seekable position bar and the playback controls on
// the right. The background is the same pair of colours sampled from the cover's edges that Album art and Lyrics use
// (--fill-l / --fill-r, set by artmode.js), darkened, so it changes with every song.
// Spotify's design rules: the cover is never cropped, blurred or covered; the Spotify logo is shown and links to the
// song; truncated song text can be shown in full with a tap. Library access is read-only, so there is no ♥ button.
import { crossfader, createSeekBar, paintControls, statusMessage } from "./nowplaying.js";

const $ = id => document.getElementById(id);

export function createPlayerMode({ playback, isPremiumBlocked }) {
  const stage = $("playerStage"), meta = $("plMeta");
  const cover = crossfader($("plArtA"), $("plArtB"));
  let trackId, swapTimer;

  $("plPlay").onclick = () => playback.togglePlay();
  $("plNext").onclick = () => playback.next();
  $("plPrev").onclick = () => playback.previous();
  $("plShuffle").onclick = () => playback.toggleShuffle();
  $("plRepeat").onclick = () => playback.cycleRepeat();
  // Tapping the song text shows it in full (Spotify requires truncated metadata to be viewable).
  const toggleFull = e => { e.stopPropagation(); meta.classList.toggle("full"); };
  meta.addEventListener("click", toggleFull);
  meta.addEventListener("keydown", e => { if (e.key === "Enter") toggleFull(e); });

  const seek = createSeekBar(
    { bar: $("plBar"), fill: $("plBarFill"), knob: $("plBarKnob"), elapsed: $("plElapsed"), remaining: $("plRemaining") },
    playback, isPremiumBlocked);

  /** Called whenever the playing item changes. track = normalized track from playback.js, or null. */
  function update(track, connected) {
    stage.classList.toggle("empty", !track);
    $("plMsg").textContent = !connected ? "Connect Spotify to show what's playing here."
      : !track ? "Nothing is playing on Spotify."
      : "";
    cover(track ? track.image : null);
    $("plLogo").href = (track && track.url) || "https://open.spotify.com/";   // url is already checked in playback.js
    const id = track ? track.id : null;
    if (id === trackId) return;
    const apply = () => {
      $("plTitle").textContent = track ? track.title : "";
      $("plArtist").textContent = track ? track.artists : "";
      $("plAlbum").textContent = track ? track.album : "";
      meta.classList.remove("swap", "full");
    };
    clearTimeout(swapTimer);
    if (trackId === undefined || !track) apply();
    else { meta.classList.add("swap"); swapTimer = setTimeout(apply, 260); }   // soft fade between songs
    trackId = id;
  }

  /** Called with every playback update (state = null when nothing is active). */
  function render(state, err) {
    const dev = state && state.device;
    const restricted = !!(dev && dev.restricted), premium = isPremiumBlocked();
    paintControls({ play: $("plPlay"), prev: $("plPrev"), next: $("plNext"), shuffle: $("plShuffle"), repeat: $("plRepeat") },
      state, premium || restricted);
    seek.bar.classList.toggle("locked", !seek.canSeek());
    // Only problems that affect this screen's controls; "nothing playing" has its own message.
    let msg = err && err.reason !== "NOT_CONNECTED" ? statusMessage(err) : "";
    if (!msg && premium) msg = statusMessage({ reason: "PREMIUM_REQUIRED" });
    if (!msg && restricted) msg = statusMessage({ reason: "RESTRICTED" });
    $("plStatus").textContent = msg;
    seek.paint();
  }

  return { update, render };
}
