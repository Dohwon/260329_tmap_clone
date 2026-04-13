#!/usr/bin/env python3
import json
import os
import posixpath
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = ROOT / "web-lab"
TMAP_BASE = "https://apis.openapi.sk.com"
HOST = os.environ.get("TMAP_WEB_HOST", "0.0.0.0")
PORT = int(os.environ.get("TMAP_WEB_PORT", "4173"))


def load_local_env():
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_local_env()
TMAP_APP_KEY = os.environ.get("TMAP_APP_KEY", "")


class TmapWebHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.handle_api()
            return
        self.send_error(405, "Method not allowed")

    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        path = posixpath.normpath(urllib.parse.unquote(path))
        if path in ("", "/"):
            return str(WEB_ROOT / "index.html")
        return str(WEB_ROOT / path.lstrip("/"))

    def handle_api(self):
        if not TMAP_APP_KEY:
            self.send_json(500, {"error": "TMAP_APP_KEY is required"})
            return

        parsed = urllib.parse.urlparse(self.path)
        routes = {
            "/api/pois": ("GET", "/tmap/pois"),
            "/api/near-road": ("GET", "/tmap/road/nearToRoad"),
            "/api/routes": ("POST", "/tmap/routes?version=1&format=json"),
            "/api/routes-sequential": ("POST", "/tmap/routes/routeSequential30?version=1&format=json"),
            "/api/match-roads": ("POST_FORM", "/tmap/road/matchToRoads?version=1"),
        }
        route = routes.get(parsed.path)
        if route is None:
            self.send_json(404, {"error": f"Unknown API path: {parsed.path}"})
            return

        mode, upstream = route
        try:
            if mode == "GET":
                query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
                flat_query = [(key, values[-1]) for key, values in query.items()]
                target = f"{TMAP_BASE}{upstream}?{urllib.parse.urlencode(flat_query)}"
                request = urllib.request.Request(target, method="GET")
                request.add_header("Accept", "application/json")
                request.add_header("appKey", TMAP_APP_KEY)
                self.forward(request)
                return

            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length) if length > 0 else b""

            if mode == "POST":
                target = f"{TMAP_BASE}{upstream}"
                request = urllib.request.Request(target, data=raw_body, method="POST")
                request.add_header("Accept", "application/json")
                request.add_header("Content-Type", "application/json")
                request.add_header("appKey", TMAP_APP_KEY)
                self.forward(request)
                return

            if mode == "POST_FORM":
                payload = json.loads(raw_body.decode("utf-8") or "{}")
                form_body = urllib.parse.urlencode(
                    {
                        "responseType": "1",
                        "coords": payload.get("coords", ""),
                    }
                ).encode("utf-8")
                target = f"{TMAP_BASE}{upstream}"
                request = urllib.request.Request(target, data=form_body, method="POST")
                request.add_header("Accept", "application/json")
                request.add_header("Content-Type", "application/x-www-form-urlencoded")
                request.add_header("appKey", TMAP_APP_KEY)
                self.forward(request)
                return

        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON body"})

    def forward(self, request):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                content_type = response.headers.get("Content-Type", "application/json")
                self.send_response(response.status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as exc:
            body = exc.read() or json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001
            self.send_json(502, {"error": str(exc)})

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((HOST, PORT), TmapWebHandler)
    print(f"Serving web-lab on http://{HOST}:{PORT}")
    print("Use TMAP_APP_KEY environment variable to forward TMAP requests.")
    server.serve_forever()


if __name__ == "__main__":
    main()
