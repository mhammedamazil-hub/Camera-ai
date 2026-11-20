"""Model providers: Ollama, llama.cpp, OpenAI-compatible, Transformers (lazy), Mock fallback.
All expose: name, context_length, available(), generate(prompt, system) -> str, embed(text)->list|None"""
from __future__ import annotations
import json, urllib.request, urllib.error

def _http_post(url, payload, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
        headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def _http_get(url, timeout=5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())

class BaseProvider:
    name = "base"; context_length = 4096
    def available(self): return False
    def generate(self, prompt, system=""): raise NotImplementedError
    def embed(self, text): return None
    def list_models(self): return []

class MockProvider(BaseProvider):
    """Deterministic heuristic fallback: zero download, proves orchestration/memory/sleep without a real LLM.
    Clearly NOT intelligence — labelled as such everywhere."""
    name = "mock"; context_length = 4096
    def available(self): return True
    def generate(self, prompt, system=""):
        p = (prompt or "")[:2000]
        return ("[MOCK-RESPONSE — no real LLM loaded. Configure Ollama/llama.cpp for intelligence.]\n"
                f"Echo of task context (truncated): {p[:600]}\n"
                "Next step: record this as an episode; run `nace sleep` to consolidate.")
    def list_models(self): return ["mock (built-in fallback)"]

class OllamaProvider(BaseProvider):
    name = "ollama"
    def __init__(self, host="http://localhost:11434", model="qwen3:4b", context_length=8192):
        self.host = host.rstrip("/"); self.model = model; self.context_length = context_length
    def available(self):
        try: _http_get(self.host + "/api/tags", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        d = _http_post(self.host + "/api/chat", {"model": self.model,
            "messages": ([{"role":"system","content":system}] if system else []) + [{"role":"user","content":prompt}],
            "stream": False})
        return d.get("message",{}).get("content","")
    def embed(self, text):
        try:
            d = _http_post(self.host + "/api/embeddings", {"model": self.model, "prompt": text})
            return d.get("embedding")
        except Exception: return None
    def list_models(self):
        try:
            d = _http_get(self.host + "/api/tags")
            return [m["name"] for m in d.get("models",[])]
        except Exception: return []

class LlamaCppProvider(BaseProvider):
    name = "llamacpp"
    def __init__(self, host="http://localhost:8080", model="local", context_length=8192):
        self.host = host.rstrip("/"); self.model = model; self.context_length = context_length
    def available(self):
        try: _http_get(self.host + "/health", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        d = _http_post(self.host + "/v1/chat/completions", {"model": self.model,
            "messages": ([{"role":"system","content":system}] if system else []) + [{"role":"user","content":prompt}]})
        return d["choices"][0]["message"]["content"]
    def list_models(self):
        try: return [m["id"] for m in _http_get(self.host + "/v1/models").get("data",[])]
        except Exception: return []

class OpenAICompatProvider(BaseProvider):
    name = "openai-compat"
    def __init__(self, base="http://localhost:11434/v1", model="qwen3:4b", context_length=8192, api_key=""):
        self.base = base.rstrip("/"); self.model = model; self.context_length = context_length; self.api_key = api_key
    def available(self):
        try: _http_get(self.base + "/models", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        d = _http_post(self.base + "/chat/completions", {"model": self.model,
            "messages": ([{"role":"system","content":system}] if system else []) + [{"role":"user","content":prompt}]})
        return d["choices"][0]["message"]["content"]
    def list_models(self):
        try: return [m["id"] for m in _http_get(self.base + "/models").get("data",[])]
        except Exception: return []

class TransformersProvider(BaseProvider):
    """Lazy: only imports torch/transformers if installed. Never auto-downloads in tests."""
    name = "transformers"
    def __init__(self, model="Qwen/Qwen3-4B", context_length=8192):
        self.model_id = model; self.context_length = context_length; self._pipe = None
    def available(self):
        try: import transformers, torch; return True
        except Exception: return False
    def generate(self, prompt, system=""):
        if self._pipe is None:
            from transformers import pipeline
            self._pipe = pipeline("text-generation", model=self.model_id)
        out = self._pipe(prompt, max_new_tokens=512, do_sample=False)
        return out[0].get("generated_text","") if out else ""
    def list_models(self): return [self.model_id] if self.available() else []

def make_provider(backend, cfg, hardware=None):
    b = (backend or cfg.model_backend or "auto").lower()
    if b == "auto":
        for cls, kw in [(OllamaProvider, dict(host=cfg.ollama_host, model=cfg.model_name or "qwen3:4b")),
                        (LlamaCppProvider, dict(host=cfg.llamacpp_host, model=cfg.model_name or "local")),
                        (OpenAICompatProvider, dict(base=cfg.openai_base, model=cfg.model_name or "qwen3:4b"))]:
            p = cls(**kw)
            if p.available(): return p
        return MockProvider()
    if b == "ollama": return OllamaProvider(host=cfg.ollama_host, model=cfg.model_name or "qwen3:4b")
    if b == "llamacpp": return LlamaCppProvider(host=cfg.llamacpp_host, model=cfg.model_name or "local")
    if b == "openai": return OpenAICompatProvider(base=cfg.openai_base, model=cfg.model_name or "qwen3:4b")
    if b == "transformers": return TransformersProvider(model=cfg.model_name or "Qwen/Qwen3-4B")
    return MockProvider()
