"""In-process GGUF inference via llama.cpp (llama-cpp-python). No server, no network.
This is a REAL pretrained model running on CPU in this process."""
from __future__ import annotations
import os
from nace.models.providers import BaseProvider, ProviderError

class GGUFProvider(BaseProvider):
    name = "gguf-local"; supports_tools = False
    def __init__(self, model_path, context_length=2048, n_threads=None, temperature=0.7):
        self.model_path = model_path
        self.context_length = context_length
        self.n_threads = n_threads or max(1, (os.cpu_count() or 2))
        self.temperature = temperature
        self._llm = None
    def _load(self):
        if self._llm is not None: return self._llm
        try:
            from llama_cpp import Llama
        except ImportError as e:
            raise ProviderError("llama-cpp-python not installed: pip install llama-cpp-python") from e
        if not os.path.exists(self.model_path):
            raise ProviderError(f"model file missing: {self.model_path}")
        self._llm = Llama(model_path=self.model_path, n_ctx=self.context_length,
                          n_threads=self.n_threads, verbose=False)
        return self._llm
    def available(self):
        try: self._load(); return True
        except Exception: return False
    def chat(self, messages, tools=None):
        llm = self._load()
        msgs = [{"role": m["role"], "content": m.get("content", "")} for m in messages if m.get("role") in ("system", "user", "assistant")]
        try:
            out = llm.create_chat_completion(messages=msgs, max_tokens=min(120, self.context_length // 4),
                                             temperature=self.temperature,
                                             stop=["\nUser:", "\nQ:", "\n\n\n"])
            txt = out["choices"][0]["message"]["content"].strip()
            # small models sometimes echo the prompt's "Question:"/"Answer:" scaffolding
            for junk in ("Question:", "Answer:", "What I know about you:"):
                if txt.startswith(junk): txt = txt[len(junk):].strip()
            return {"content": txt, "tool_calls": []}
        except Exception as e:
            raise ProviderError(f"inference failed: {e}") from e
    def generate(self, prompt, system=""):
        msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
        return self.chat(msgs)["content"]
    def list_models(self): return [os.path.basename(self.model_path)]
    def model_info(self):
        return {"provider": self.name, "model": os.path.basename(self.model_path),
                "context_length": self.context_length, "supports_tools": False,
                "real_pretrained": True, "in_process": True, "threads": self.n_threads}
