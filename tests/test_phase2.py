import json, os, sys, tempfile, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from nace.models.providers import OllamaProvider, ProviderError, ScriptedPolicyProvider
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.tools.framework import ToolRegistry
from nace.learning.benchmarks import run_all as run_benchmarks

class StubOllama(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/api/tags": self._send({"models": [{"name": "qwen3:4b"}]})
        else: self.send_response(404); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/api/chat":
            if body.get("tools"):
                self._send({"message": {"content": "", "tool_calls": [{"function": {"name": "read_file", "arguments": {"path": "x.txt"}}}]}})
            else:
                self._send({"message": {"content": "stub-reply"}})
        elif self.path == "/api/embeddings":
            self._send({"embedding": [0.1, 0.2]})
        else:
            self.send_response(404); self.end_headers()

class TestProviders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), StubOllama)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()
    def test_ollama_chat(self):
        p = OllamaProvider(host=f"http://127.0.0.1:{self.port}", model="qwen3:4b")
        self.assertTrue(p.available())
        self.assertEqual(p.generate("hi"), "stub-reply")
        self.assertEqual(p.list_models(), ["qwen3:4b"])
    def test_ollama_tool_calls(self):
        p = OllamaProvider(host=f"http://127.0.0.1:{self.port}", model="qwen3:4b")
        r = p.chat([{"role": "user", "content": "read x"}], tools=[{"type": "function", "function": {"name": "read_file"}}])
        self.assertEqual(r["tool_calls"][0]["name"], "read_file")
    def test_ollama_unavailable_raises(self):
        p = OllamaProvider(host="http://127.0.0.1:1", model="x")
        self.assertFalse(p.available())
        with self.assertRaises(ProviderError): p.generate("hi")

class TestTools(unittest.TestCase):
    def test_real_file_ops(self):
        ws = tempfile.mkdtemp()
        t = ToolRegistry(workspace=ws)
        self.assertEqual(t.call("write_file", {"path": "a.txt", "content": "hello"})["status"], "ok")
        self.assertIn("hello", t.call("read_file", {"path": "a.txt"})["result"])
        self.assertEqual(t.call("edit_file", {"path": "a.txt", "old": "hello", "new": "bye"})["status"], "ok")
        self.assertIn("bye", t.call("read_file", {"path": "a.txt"})["result"])
    def test_permissions_blocked(self):
        t = ToolRegistry(workspace=tempfile.mkdtemp())
        self.assertEqual(t.call("run_shell", {"cmd": "echo hi"})["status"], "error")
        self.assertEqual(t.call("http_get", {"url": "http://x"})["status"], "error")
        self.assertEqual(t.call("read_file", {"path": "../escape"})["status"], "error")
        self.assertEqual(t.call("run_python", {"code": "print(1)"})["status"], "error")  # approval needed
    def test_approval_allows(self):
        t = ToolRegistry(workspace=tempfile.mkdtemp(), approved=["run_python"])
        self.assertIn("42", t.call("run_python", {"code": "print(42)"})["result"])
    def test_validation(self):
        t = ToolRegistry(workspace=tempfile.mkdtemp())
        self.assertEqual(t.call("read_file", {})["status"], "error")
        self.assertEqual(t.call("nope", {})["status"], "error")

class TestCognitiveLoop(unittest.TestCase):
    def test_loop_with_scripted_policy(self):
        tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
        o = Orchestrator(NaceConfig(data_dir=tmp), provider=ScriptedPolicyProvider([
            {"action": "write_file", "args": {"path": "out.txt", "content": "done"}, "reasoning": "write"},
            {"finish": True, "summary": "wrote file"},
        ]))
        res = o.run_cognitive_task("Write out.txt", workspace=ws)
        self.assertEqual(res["status"], "COMPLETED")
        self.assertTrue(os.path.exists(os.path.join(ws, "out.txt")))
        self.assertTrue(len(o.db.query("SELECT * FROM tool_calls WHERE task_id=?", (res["task_id"],))) >= 1)
        o.close()
    def test_loop_budget_stops(self):
        tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
        o = Orchestrator(NaceConfig(data_dir=tmp), provider=ScriptedPolicyProvider(
            [{"action": "now", "args": {}, "reasoning": "x"}] * 50))
        res = o.run_cognitive_task("Infinite now", workspace=ws, max_iterations=5)
        self.assertIn(res["status"], ("BLOCKED", "COMPLETED"))
        self.assertLessEqual(res.get("iterations", 0), 6)
        o.close()

class TestBenchmarks(unittest.TestCase):
    def test_all_benchmarks_pass(self):
        r = run_benchmarks()
        self.assertEqual(r["passed"], r["total"], f"failed: {[k for k,v in r['results'].items() if not v.get('passed')]}")

if __name__ == "__main__":
    unittest.main()
