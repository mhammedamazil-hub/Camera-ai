"""Role-based model selection. One model may fill several roles on low RAM."""
from __future__ import annotations
ROLES = ("primary","coding","small","memory","embedding","vision")
class ModelSelector:
    def __init__(self, provider, hardware):
        self.provider = provider; self.hardware = hardware
        self.assignments = {r: provider.name for r in ROLES}
    def select(self, task_type="general"):
        if task_type == "code": return self.assignments["coding"]
        if task_type in ("summarize","memory"): return self.assignments["memory"]
        if task_type in ("classify","extract"): return self.assignments["small"]
        return self.assignments["primary"]
