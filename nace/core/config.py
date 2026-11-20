"""NACE configuration: identity, principles, budgets. Structured, not LLM-overwritable."""
from __future__ import annotations
import json, os
from dataclasses import dataclass, field, asdict

@dataclass
class NaceConfig:
    data_dir: str = "./data"
    db_path: str = ""
    model_backend: str = "auto"   # auto|ollama|llamacpp|openai|transformers|mock
    model_name: str = ""
    ollama_host: str = "http://localhost:11434"
    llamacpp_host: str = "http://localhost:8080"
    openai_base: str = "http://localhost:11434/v1"
    context_budget: int = 4096
    reserve_output_tokens: int = 1024
    # sleep thresholds (fraction of usable context)
    sleep_prepare: float = 0.60
    sleep_checkpoint: float = 0.75
    sleep_trigger: float = 0.85
    sleep_emergency: float = 0.95
    idle_sleep_seconds: int = 300
    max_working_items: int = 50
    identity: str = "NACE — Neurogenesis Artificial Cognitive Engine. A persistent cognitive architecture; the LLM is its reasoning engine, NACE provides memory, continuity, tools and sleep."
    principles: tuple = (
        "Never invent past experiences; retrieve actual records.",
        "Never turn an assumption into a verified memory; label confidence.",
        "Preserve source episodes; summaries never replace them.",
        "Sleep before context exhaustion; checkpoint deterministically first.",
        "Do not claim memory storage is model training.",
        "Do not claim consciousness; this is a computational cognitive architecture.",
    )
    def __post_init__(self):
        if not self.db_path:
            self.db_path = os.path.join(self.data_dir, "nace.db")
    def to_dict(self): return asdict(self)
    def save(self, path=None):
        path = path or os.path.join(self.data_dir, "config.json")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w") as f: json.dump(self.to_dict(), f, indent=2)
        os.replace(tmp, path)
        return path
    @classmethod
    def load(cls, path=None, data_dir="./data"):
        p = path or os.path.join(data_dir, "config.json")
        if os.path.exists(p):
            d = json.load(open(p))
            d.pop("principles", None)
            return cls(**{k:v for k,v in d.items() if k in cls.__dataclass_fields__})
        return cls(data_dir=data_dir)
