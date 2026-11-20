"""Lightweight resource-aware scheduler. No fake consciousness; just activity selection."""
from __future__ import annotations
import time
class Scheduler:
    def __init__(self, hardware): self.hw = hardware; self.last = {}
    def choose(self, context_level="ok", idle=False, task_active=False):
        if context_level in ("sleep","emergency"): return "sleep"
        if context_level in ("prepare","checkpoint"): return "consolidation"
        if task_active: return "reasoning"
        if idle: return "idle-maintenance"
        return "reasoning"
