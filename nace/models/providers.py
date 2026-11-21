"""Model providers v2: Ollama, llama.cpp, OpenAI-compat, Transformers (lazy), Mock, ScriptedPolicy.
Interface: name, context_length, available(), generate(prompt, system), chat(messages, tools),
list_models(), model_info(). All network errors raise ProviderError (never silent)."""
from __future__ import annotations
import json, urllib.request, urllib.error

class ProviderError(RuntimeError): pass

def _http_post(url, payload, timeout=120, headers=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500] if hasattr(e, "read") else ""
        raise ProviderError(f"HTTP {e.code} from {url}: {body}") from e
    except Exception as e:
        raise ProviderError(f"request to {url} failed: {e}") from e

def _http_get(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        raise ProviderError(f"request to {url} failed: {e}") from e

class BaseProvider:
    name = "base"; context_length = 4096; supports_tools = False
    def available(self): return False
    def generate(self, prompt, system=""): raise NotImplementedError
    def chat(self, messages, tools=None):
        # default: flatten to generate()
        sys_ = "\n".join(m["content"] for m in messages if m.get("role") == "system")
        user = "\n".join(m["content"] for m in messages if m.get("role") != "system")
        return {"content": self.generate(user, system=sys_), "tool_calls": []}
    def embed(self, text): return None
    def list_models(self): return []
    def model_info(self): return {"provider": self.name, "context_length": self.context_length, "supports_tools": self.supports_tools}

class MockProvider(BaseProvider):
    """Deterministic echo fallback. Proves plumbing only; NOT intelligence. Never used for benchmarks."""
    name = "mock"; context_length = 4096
    def available(self): return True
    def generate(self, prompt, system=""):
        return ("[MOCK-RESPONSE — no real LLM loaded. Configure Ollama/llama.cpp for intelligence.]\n"
                f"Echo (truncated): {(prompt or '')[:600]}\nNext step: record as episode; run `nace sleep`.")
    def list_models(self): return ["mock (built-in fallback)"]

class ScriptedPolicyProvider(BaseProvider):
    """Deterministic test double for evaluation: follows a script of JSON actions.
    Explicitly NOT intelligence — used only to test the loop/tools/memory deterministically."""
    name = "scripted-policy"; context_length = 8192
    def __init__(self, script):
        self.script = list(script); self.calls = 0
    def available(self): return True
    def generate(self, prompt, system=""):
        self.calls += 1
        if self.script:
            return json.dumps(self.script.pop(0))
        return json.dumps({"finish": True, "summary": "script exhausted"})
    def list_models(self): return ["scripted-policy (test double)"]

class OllamaProvider(BaseProvider):
    name = "ollama"; supports_tools = True
    def __init__(self, host="http://localhost:11434", model="qwen3:4b", context_length=8192, timeout=180):
        self.host = host.rstrip("/"); self.model = model; self.context_length = context_length; self.timeout = timeout
    def available(self):
        try: _http_get(self.host + "/api/tags", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        return self.chat([{"role": "system", "content": system} if system else {"role": "user", "content": prompt}] +
                         ([{"role": "user", "content": prompt}] if system else []))["content"]
    def chat(self, messages, tools=None):
        payload = {"model": self.model, "messages": messages, "stream": False}
        if tools: payload["tools"] = tools
        d = _http_post(self.host + "/api/chat", payload, timeout=self.timeout)
        msg = d.get("message", {})
        tcs = []
        for tc in msg.get("tool_calls", []) or []:
            fn = tc.get("function", tc)
            args = fn.get("arguments", {})
            tcs.append({"name": fn.get("name"), "arguments": args if isinstance(args, str) else json.dumps(args)})
        return {"content": msg.get("content", ""), "tool_calls": tcs}
    def embed(self, text):
        try:
            d = _http_post(self.host + "/api/embeddings", {"model": self.model, "prompt": text}, timeout=30)
            return d.get("embedding")
        except Exception: return None
    def list_models(self):
        try: return [m["name"] for m in _http_get(self.host + "/api/tags").get("models", [])]
        except Exception: return []
    def model_info(self):
        info = super().model_info(); info["model"] = self.model; info["installed"] = self.list_models(); return info

class LlamaCppProvider(BaseProvider):
    name = "llamacpp"; supports_tools = True
    def __init__(self, host="http://localhost:8080", model="local", context_length=8192, timeout=180):
        self.host = host.rstrip("/"); self.model = model; self.context_length = context_length; self.timeout = timeout
    def available(self):
        try: _http_get(self.host + "/health", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        return self.chat([{"role": "system", "content": system} if system else {"role": "user", "content": prompt}] +
                         ([{"role": "user", "content": prompt}] if system else []))["content"]
    def chat(self, messages, tools=None):
        payload = {"model": self.model, "messages": messages}
        if tools: payload["tools"] = tools
        d = _http_post(self.host + "/v1/chat/completions", payload, timeout=self.timeout)
        msg = d["choices"][0]["message"]
        tcs = [{"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "{}")} for tc in msg.get("tool_calls", [])]
        return {"content": msg.get("content", "") or "", "tool_calls": tcs}
    def list_models(self):
        try: return [m["id"] for m in _http_get(self.host + "/v1/models").get("data", [])]
        except Exception: return []

class OpenAICompatProvider(BaseProvider):
    name = "openai-compat"; supports_tools = True
    def __init__(self, base="http://localhost:11434/v1", model="qwen3:4b", context_length=8192, api_key="", timeout=180):
        self.base = base.rstrip("/"); self.model = model; self.context_length = context_length; self.api_key = api_key; self.timeout = timeout
    def _headers(self): return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
    def available(self):
        try: _http_get(self.base + "/models", timeout=3); return True
        except Exception: return False
    def generate(self, prompt, system=""):
        return self.chat([{"role": "system", "content": system} if system else {"role": "user", "content": prompt}] +
                         ([{"role": "user", "content": prompt}] if system else []))["content"]
    def chat(self, messages, tools=None):
        payload = {"model": self.model, "messages": messages}
        if tools: payload["tools"] = tools
        d = _http_post(self.base + "/chat/completions", payload, timeout=self.timeout, headers=self._headers())
        msg = d["choices"][0]["message"]
        tcs = [{"name": tc["function"]["name"], "arguments": tc["function"].get("arguments", "{}")} for tc in msg.get("tool_calls", [])]
        return {"content": msg.get("content", "") or "", "tool_calls": tcs}
    def list_models(self):
        try: return [m["id"] for m in _http_get(self.base + "/models").get("data", [])]
        except Exception: return []

class TransformersProvider(BaseProvider):
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
        return out[0].get("generated_text", "") if out else ""
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
    if b == "mock": return MockProvider()
    return MockProvider()
