"""Strategy library: versioned, evidence-backed procedures with invalidation.
A procedure is only promoted after repeated success; failures can invalidate it."""
from __future__ import annotations
class StrategyLibrary:
    def __init__(self, store): self.store = store
    def add_procedure(self, title, content, project="", confidence=0.6):
        return self.store.add(type="procedural", title=title, content=content, project=project,
                              confidence=confidence, importance=0.7, source="strategy-library", provenance="verified")
    def invalidate(self, mid, reason=""):
        self.store.update_status(mid, "INVALIDATED")
        self.store.add(type="failure", title=f"procedure #{mid} invalidated", content=f"Procedure {mid} invalidated: {reason}", confidence=0.8, importance=0.8, source="strategy-library", provenance="observation")
    def find(self, query, project=None, limit=5):
        from nace.memory.retrieval import Retriever
        return Retriever(self.store).search(query, project=project, types=("procedural",), limit=limit)
    def promote_if_repeated(self, title, content, project="", successes=2):
        """Only promote to procedural after `successes` recorded successes (checked via success memories)."""
        from nace.memory.retrieval import Retriever
        hits = Retriever(self.store).search(title, project=project, types=("success",), limit=10)
        if len(hits) >= successes:
            return self.add_procedure(title, content, project, confidence=0.8)
        return None
