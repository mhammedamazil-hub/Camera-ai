"""Sleep triggers: context pressure, task completion, idle, manual, shutdown."""
from __future__ import annotations
import time
class TriggerMonitor:
    def __init__(self, ctx, idle_seconds=300):
        self.ctx = ctx; self.idle_seconds = idle_seconds; self.last_activity = time.time()
    def touch(self): self.last_activity = time.time()
    def check(self, task_completed=False, manual=False, shutdown=False, memory_pressure=False):
        if manual: return "manual"
        if shutdown: return "shutdown"
        if memory_pressure: return "memory-pressure"
        lvl = self.ctx.level() if self.ctx else "ok"
        if lvl == "emergency": return "context-emergency"
        if lvl == "sleep": return "context-threshold"
        if task_completed: return "task-completion"
        if time.time() - self.last_activity > self.idle_seconds: return "idle"
        return None
