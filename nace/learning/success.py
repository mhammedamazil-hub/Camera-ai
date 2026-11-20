"""Success learning: one success is an episode; repeated success may become a procedure."""
from __future__ import annotations
class SuccessLearner:
    def __init__(self, store): self.store = store
    def record(self, title, content, project="", reusable=False, confidence=0.7):
        t = "procedural" if reusable else "success"
        return self.store.add(type=t, title=title, content=content, project=project,
                              confidence=confidence, importance=0.7, source="success-learning")
    def recall(self, query, project=None, limit=5):
        from nace.memory.retrieval import Retriever
        return Retriever(self.store).search(query, project=project, types=("success","procedural"), limit=limit)
