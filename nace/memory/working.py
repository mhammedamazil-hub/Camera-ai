"""Working memory: bounded, actively managed scratchpad for the active task."""
from __future__ import annotations
class WorkingMemory:
    def __init__(self, max_items=50):
        self.max_items = max_items; self.items = {}
    def set(self, key, value): self.items[key] = value; self._trim()
    def get(self, key, default=None): return self.items.get(key, default)
    def delete(self, key): self.items.pop(key, None)
    def clear(self): self.items.clear()
    def _trim(self):
        while len(self.items) > self.max_items:
            self.items.pop(next(iter(self.items)))
    def snapshot(self): return dict(self.items)
