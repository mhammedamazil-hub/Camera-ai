"""NACE-1: a FUSED ENTITY, not a universal framework.

One model, one mind, one file. The weights, the identity, the memory and the
sleep cycle are bound together into a single artifact (`*.nace`).

This is NOT a system that accepts any AI. It IS this AI.

Honest boundary: the sleep mechanism cannot be written into the GGUF tensor
weights — that would require training, which we do not do. What IS fused is:
  weights + identity + born memory + sleep policy -> one indivisible entity file.
The neural net provides the language; the entity provides the continuity.
"""
from __future__ import annotations
import json, os, shutil, sqlite3, tempfile, time, zipfile

ENTITY_FORMAT = "nace-entity/1"

class NaceEntity:
    def __init__(self, model_path, data_dir, name="NACE-1", context_length=2048, temperature=0.7):
        self.model_path = model_path
        self.data_dir = data_dir
        self.name = name
        self.orch = None
        self.provider = None
        self._context_length = context_length
        self._temperature = temperature
    # ---------- lifecycle ----------
    def awaken(self):
        from nace.core.config import NaceConfig
        from nace.core.orchestrator import Orchestrator
        from nace.models.gguf_provider import GGUFProvider
        os.makedirs(self.data_dir, exist_ok=True)
        cfg = NaceConfig.load(data_dir=self.data_dir)
        cfg.identity = (f"You are {self.name}, a single continuous mind. You were built from the "
                        f"TinyLlama-1.1B pretrained model and you persist through memory, not through "
                        f"retraining. You have slept {cfg.__dict__.get('sleep_count', 0)} times.")
        self.provider = GGUFProvider(self.model_path, context_length=self._context_length,
                                     temperature=self._temperature)
        self.orch = Orchestrator(cfg, provider=self.provider)
        return self
    # ---------- the fused behaviour: speak with memory ----------
    def speak(self, message, remember=False):
        o = self.orch
        if remember or "remember" in message.lower():
            fact = message.split("remember", 1)[-1].strip(" that:") if "remember" in message.lower() else message
            o.store.add(type="semantic", title=fact[:60], content=fact, confidence=1.0,
                        importance=0.9, source="entity-chat", provenance="user")
        recalled = o.retriever.search(message, limit=5)
        mem_block = "\n".join(f"- {r['content'][:300]} (conf {r.get('confidence', 0.5):.2f}, source {r.get('provenance','?')})"
                              for r in recalled)
        system = (o.cfg.identity + "\n\nMEMORIES RETRIEVED FROM YOUR OWN PAST — these are real records, "
                  "not training data. Use them if relevant. If a memory answers the question, state it. "
                  "If you have no memory of something, say so honestly instead of inventing.\n" + (mem_block or "(no relevant memories)"))
        reply = self.provider.generate(message, system=system)
        o.record_event("entity-chat", f"user: {message} | reply: {reply[:600]}", kind="observation")
        return {"reply": reply, "recalled": recalled}
    # ---------- sleep: fused, not bolted on ----------
    def sleep(self, reason="manual"):
        rep = self.orch.sleep_now(reason=reason)
        self.orch.cfg.sleep_count = self.orch.cfg.__dict__.get("sleep_count", 0) + 1
        try: self.orch.cfg.save()
        except Exception: pass
        return rep
    def state(self):
        o = self.orch
        return {"entity": self.name, "model": os.path.basename(self.model_path),
                "model_mb": round(os.path.getsize(self.model_path) / 1e6, 1),
                "fused": ["weights", "identity", "born-memory", "sleep-policy"],
                "sleep_count": o.cfg.__dict__.get("sleep_count", 0),
                "memories": o.status().get("memory_counts", {}),
                "context": {"length": self._context_length},
                "real_pretrained_inference": True}

# ---------- one file = one entity ----------
def pack_entity(model_path, data_dir, out_path, name="NACE-1"):
    """Bundle weights + identity + memory into ONE indivisible .nace file."""
    manifest = {"format": ENTITY_FORMAT, "name": name, "created": time.time(),
                "model": os.path.basename(model_path), "fused": ["weights", "identity", "born-memory", "sleep-policy"]}
    db = os.path.join(data_dir, "nace.db")
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_STORED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        z.write(model_path, "model/" + os.path.basename(model_path))
        if os.path.exists(db):
            tmp = db + ".packdb"; shutil.copy(db, tmp)
            try:
                c = sqlite3.connect(tmp); c.execute("PRAGMA wal_checkpoint(TRUNCATE)"); c.close()
            except Exception: pass
            z.write(tmp, "memory/nace.db"); os.remove(tmp)
    return out_path

def unpack_entity(nace_path, workdir):
    with zipfile.ZipFile(nace_path) as z:
        z.extractall(workdir)
        manifest = json.loads(z.read("manifest.json"))
    return {"manifest": manifest,
            "model_path": os.path.join(workdir, "model", manifest["model"]),
            "data_dir": os.path.join(workdir, "memory")}
