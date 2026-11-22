"""Web server for the FUSED ENTITY NACE-1 (real in-process GGUF inference).
python3 -m nace.entity_server --port 8000"""
from __future__ import annotations
import argparse, json, threading, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from nace.entity import NaceEntity, ENTITY_FORMAT

HTML = open(os.path.join(os.path.dirname(__file__), "entity_ui.html")).read()

class Handler(BaseHTTPRequestHandler):
    entity = None; lock = threading.Lock()
    def log_message(self, *a): pass
    def _send(self, body, ctype="application/json", code=200):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(b)
    def do_HEAD(self): self._send("", "text/html")
    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD"),
                     ("Access-Control-Allow-Headers", "Content-Type"), ("Content-Length", "0")):
            self.send_header(k, v)
        self.end_headers()
    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"): self._send(HTML, "text/html")
        elif p == "/health": self._send('{"ok":true}')
        elif p == "/api/state":
            with self.lock: self._send(json.dumps(self.entity.state(), default=str))
        else: self._send("not found", code=404)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        d = json.loads(self.rfile.read(n) or b"{}")
        p = self.path.split("?")[0]
        if p == "/api/speak":
            with self.lock: r = self.entity.speak(d.get("message", ""), remember=bool(d.get("remember")))
            self._send(json.dumps(r, default=str))
        elif p == "/api/sleep":
            with self.lock: rep = self.entity.sleep("web-sleep")
            self._send(json.dumps(rep, default=str))
        else: self._send("not found", code=404)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--model", default="models/tinyllama-1.1b-q4.gguf")
    ap.add_argument("--data-dir", default="./nace1-memory")
    ap.add_argument("--context", type=int, default=2048)
    a = ap.parse_args()
    print(f"Loading {a.model} ...", flush=True)
    Handler.entity = NaceEntity(a.model, a.data_dir, context_length=a.context).awaken()
    print(f"NACE-1 awakened. real_pretrained=True  listening 0.0.0.0:{a.port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", a.port), Handler).serve_forever()

if __name__ == "__main__":
    main()
