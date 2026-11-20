"""Failure learning: record task/environment/approach/error/root-cause/fix/prevention; retrieve before repeating."""
from __future__ import annotations
class FailureLearner:
    def __init__(self, store): self.store = store
    def record(self, title, content, project="", confidence=0.6):
        return self.store.add(type="failure", title=title, content=content, project=project,
                              confidence=confidence, importance=0.85, source="failure-learning")
    def recall(self, query, project=None, limit=5):
        from nace.memory.retrieval import Retriever
        return Retriever(self.store).search(query, project=project, types=("failure",), limit=limit)
