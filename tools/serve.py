"""Local test server for the app/ folder.

Same as `python -m http.server`, but it tells the browser never to reuse a cached copy
(Cache-Control: no-store), so you always see your latest changes while developing.
Only listens on 127.0.0.1, so nothing else on your network can reach it.

Run from the project folder:  python tools/serve.py
Then open:                     http://127.0.0.1:5173/
A different port (e.g. when 5173 is busy): set PORT=5175 first.
"""
import functools
import os
import http.server
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=str(APP_DIR))
    port = int(os.environ.get("PORT", "5173"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Serving app/ at http://127.0.0.1:{port}/  (Ctrl+C to stop)", flush=True)
    server.serve_forever()
