"""NACE web chat server (stdlib only). Serves UI + JSON API on 0.0.0.0.
Usage: python3 -m nace.server --port 8000 --data-dir ./data-web [--backend ollama --model qwen3:4b]"""
from __future__ import annotations
import argparse, json, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator

HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>NACE Chat</title>
<style>
body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
#status{background:#1a1d24;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:12px;white-space:pre-wrap}
#chat{display:flex;flex-direction:column;gap:10px;margin-bottom:12px;min-height:300px}
.msg{padding:10px 14px;border-radius:12px;max-width:85%;white-space:pre-wrap;word-break:break-word}
.user{background:#2563eb;align-self:flex-end}.nace{background:#1f2430;align-self:flex-start}
.mem{font-size:12px;color:#9fb4d8;margin-top:6px}
.row{display:flex;gap:8px}input{flex:1;padding:12px;border-radius:10px;border:1px solid #333;background:#1a1d24;color:#fff}
button{padding:12px 18px;border-radius:10px;border:none;background:#2563eb;color:#fff;cursor:pointer}
button.ghost{background:#2a2f3a}
</style></head><body>
<h2>🧠 NACE — Persistent Cognitive Engine</h2>
<div id="status">loading…</div>
<div id="chat"></div>
<div class="row"><input id="in" placeholder="Ask NACE anything… (try: what do you remember?)" onkeydown="if(event.key==='Enter')send()">
<button onclick="send()">Send</button>
<button class="ghost" onclick="sleep()">💤 Sleep</button>
<button class="ghost" onclick="mems()">🧠 Memories</button></div>
<script>
async function api(p,m='GET',b){const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});return r.json()}
function add(cls,text,mem){const d=document.createElement('div');d.className='msg '+cls;d.textContent=text;
 if(mem&&mem.length){const s=document.createElement('div');s.className='mem';s.textContent='recalled: '+mem.map(m=>'#'+m.id+' '+m.title).join(' | ');d.appendChild(s)}
 document.getElementById('chat').appendChild(d);window.scrollTo(0,document.body.scrollHeight)}
async function status(){const s=await api('/api/status');document.getElementById('status').textContent=
 `model: ${s.model} (${s.model_available?'available':'UNAVAILABLE — mock fallback'}) | mode: ${s.hardware.mode} | RAM: ${s.hardware.ram_available_mb}MB free | memories: ${JSON.stringify(s.memory_counts)} | context: ${Math.round(s.context.fraction*100)}% (${s.context.level}) | integrity: ${s.integrity}`}
async function send(){const i=document.getElementById('in');const t=i.value.trim();if(!t)return;i.value='';
 add('user',t);const r=await api('/api/chat','POST',{message:t});add('nace',r.reply,r.recalled);status()}
async function sleep(){const r=await api('/api/sleep','POST',{});add('nace',`💤 Sleep complete: ${r.experiences_analyzed} experiences, ${r.new_semantic} semantic, ${r.procedures_updated} procedures, checkpoint=${r.checkpoint}, resume=${r.resume_state}`);status()}
async function mems(){const r=await api('/api/memories');add('nace',r.length?r.map(m=>`#${m.id} [${m.type}/${m.provenance||'observation'}] ${m.title}: ${m.content.slice(0,160)}`).join('\\n'):'No memories yet — chat with NACE first.');}
status();add('nace','Hello! I am NACE. I remember things across sessions and sleep to consolidate. Ask me anything — try "what do you remember?" or teach me a fact, then press Sleep and ask again after refresh.');
</script></body></html>"""

class Handler(BaseHTTPRequestHandler):
    orch = None; lock = threading.Lock()
    def log_message(self, *a): pass
    def _send(self, body, ctype="application/json", code=200):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if getattr(self, "command", "") != "HEAD":
            self.wfile.write(b)
    def do_HEAD(self):
        self._send("", "text/html")
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"): self._send(HTML, "text/html")
        elif path == "/health": self._send('{"ok": true}')
        elif path == "/api/status":
            with self.lock: self._send(json.dumps(self.orch.status(), default=str))
        elif path == "/api/memories":
            with self.lock: self._send(json.dumps(self.orch.store.list(limit=30), default=str))
        else: self._send("not found", code=404)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(n) or b"{}")
        path = self.path.split("?")[0]
        if path == "/api/chat":
            msg = data.get("message", "")
            with self.lock:
                # "remember ..." -> store immediately as user-provenance fact
                low = msg.lower()
                if "remember" in low:
                    fact = msg.split("remember", 1)[-1].strip(" that:") or msg
                    self.orch.store.add(type="semantic", title=fact[:60], content=fact,
                        confidence=1.0, importance=0.9, source="web-chat", provenance="user")
                recalled = self.orch.retriever.search(msg, limit=4)
                reply = self.orch.think(msg)
                # With the mock provider, surface retrieved memories directly so
                # answers are visible (a real LLM would phrase them instead).
                if self.orch.provider.name == "mock" and recalled:
                    reply += "\n\n[From memory] " + " | ".join(r["content"][:200] for r in recalled)
                self.orch.record_event("chat", msg, kind="observation")
            self._send(json.dumps({"reply": reply, "recalled": recalled}, default=str))
        elif path == "/api/sleep":
            with self.lock: rep = self.orch.sleep_now(reason="web-ui")
            self._send(json.dumps(rep, default=str))
        else: self._send("not found", code=404)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--data-dir", default="./data-web")
    ap.add_argument("--backend", default=""); ap.add_argument("--model", default="")
    a = ap.parse_args()
    cfg = NaceConfig.load(data_dir=a.data_dir)
    if a.backend: cfg.model_backend = a.backend
    if a.model: cfg.model_name = a.model
    Handler.orch = Orchestrator(cfg)
    print(f"NACE server on 0.0.0.0:{a.port} (model={Handler.orch.provider.name}, db={cfg.db_path})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", a.port), Handler).serve_forever()

if __name__ == "__main__":
    main()
