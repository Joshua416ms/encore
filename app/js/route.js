// Reopens whichever app you used last (Encore or Nightstand) when the Home Screen icon starts at "./".
// Nightstand is a sheet inside Encore (main.js › Nightstand sheet): if it was up last time, :root.ns-up puts it up
// again before the page draws, so it is simply there — no slide, no flash of Encore.
// Skipped when the address has a query (?code=... while finishing Spotify sign-in).
(function () {
  try {
    if (!location.search && localStorage.getItem("standby.app") === "nightstand") {
      document.documentElement.classList.add("ns-up");
    }
  } catch (e) { /* storage blocked: just stay on Encore */ }
})();
