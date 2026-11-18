// Reopens whichever app you used last (Encore or Nightstand) when the Home Screen icon starts at "./".
// Runs before the page draws, so there is no flash of the wrong app.
// Skipped when the address has a query (?code=... while finishing Spotify sign-in).
(function () {
  try {
    if (!location.search && localStorage.getItem("standby.app") === "nightstand") {
      location.replace("nightstand/");
    }
  } catch (e) { /* storage blocked: just stay on Encore */ }
})();
