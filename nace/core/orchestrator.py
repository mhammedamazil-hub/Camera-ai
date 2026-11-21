"""Cognitive orchestrator: wires model + memory + context + sleep + tasks.
Context enforcement lives here (external to the LLM), per spec section 8."""
from __future__ import annotations
import json, time
from nace.core.config import NaceConfig
from nace.core.hardware import detect_hardware, recommended_context
from nace.storage.database import Database
from nace.memory.store import MemoryStore
from nace.memory.working import WorkingMemory
from nace.memory.retrieval import Retriever
from nace.core.task_manager import TaskManager
from nace.context.manager import ContextManager, emergency_protocol
from nace.sleep.engine import SleepEngine
from nace.sleep.triggers import TriggerMonitor
from nace.models.providers import make_provider
from nace.models.registry import recommend

class Orchestrator:
    def __init__(self, cfg: NaceConfig = None, provider=None):
        self.cfg = cfg or NaceConfig.load()
        import os; os.makedirs(self.cfg.data_dir, exist_ok=True)
        self.hardware = detect_hardware(self.cfg.data_dir)
        if self.cfg.context_budget == 4096 and self.hardware.mode == "low":
            pass  # keep default; budget is configurable
        self.db = Database(self.cfg.db_path)
        self.store = MemoryStore(self.db)
        self.tm = TaskManager(self.db)
        self.working = WorkingMemory(self.cfg.max_working_items)
        self.provider = provider or make_provider("auto", self.cfg, self.hardware)
        self.ctx = ContextManager(budget=self.cfg.context_budget, reserve_output=self.cfg.reserve_output_tokens,
            prepare=self.cfg.sleep_prepare, checkpoint=self.cfg.sleep_checkpoint,
            trigger=self.cfg.sleep_trigger, emergency=self.cfg.sleep_emergency)
        self.sleep = SleepEngine(self.db, self.store, self.tm, self.provider, self.ctx)
        self.retriever = Retriever(self.store)
        self.triggers = TriggerMonitor(self.ctx, self.cfg.idle_sleep_seconds)
        self.session_events = []
        self._recovered_sleep = self.sleep.recover_interrupted()
        self._set_identity_context()
    def _set_identity_context(self):
        self.ctx.set_section("identity", self.cfg.identity + "\n" + "\n".join(self.cfg.principles))
        self.ctx.rebuild()
    def record_event(self, title, content, kind="observation", project="", **kw):
        ev = {"title": title, "content": content, "kind": kind, "project": project, **kw}
        self.session_events.append(ev)
        self.working.set(title, content)
        self.triggers.touch()
        return ev
    def think(self, prompt, task_id="", project=""):
        """One reasoning step with retrieval + context enforcement."""
        self.ctx.set_section("task", prompt)
        if task_id:
            t = self.tm.get(task_id)
            if t: self.ctx.set_section("project_state", f"Goal: {t['goal']}\nStatus: {t['status']}\nNext: {t['next_action']}")
        mems = self.retriever.search(prompt, project=project, limit=6)
        if mems: self.ctx.set_section("discoveries", self.retriever.format_for_context(mems))
        self.ctx.rebuild()
        lvl = self.ctx.level()
        if lvl == "emergency":
            steps = emergency_protocol(self.ctx, self.tm, self.sleep, task_id)
            self.record_event("context-emergency", f"Emergency protocol executed: {steps}", kind="failure")
            self.ctx.rebuild()
        elif lvl == "sleep":
            self.sleep.run(reason="context-threshold", task_id=task_id, session_events=self.session_events, project=project)
            self.session_events = []
            self.ctx.rebuild()
        system = self.ctx.sections.get("identity","")
        out = self.provider.generate(prompt, system=system)
        self.record_event("model-response", out[:2000], kind="observation", project=project)
        return out
    def run_task(self, goal, task_id=None, project=""):
        tid = task_id or self.tm.create(goal)
        self.tm.set_status(tid, "ACTIVE")
        self.tm.update(tid, next_action="begin work")
        out = self.think(goal, task_id=tid, project=project)
        self.tm.update(tid, findings=[out[:1000]], next_action="review output and continue")
        return {"task_id": tid, "output": out}
    def sleep_now(self, reason="manual", task_id="", project=""):
        if task_id: self.tm.set_status(task_id, "SLEEPING")
        report = self.sleep.run(reason=reason, task_id=task_id, session_events=self.session_events, project=project)
        self.session_events = []
        return report
    def status(self):
        return {"hardware": self.hardware.to_dict(), "model": self.provider.name,
                "model_available": self.provider.available(),
                "recommended_model": recommend(self.hardware),
                "context": self.ctx.status(), "memory_counts": self.store.counts(),
                "tasks": self.tm.list(), "sleep_history": self.sleep.history(3),
                "integrity": self.db.integrity_check()}
    def make_tools(self, workspace=".", **kw):
        from nace.tools.framework import ToolRegistry
        return ToolRegistry(db=self.db, workspace=workspace, **kw)
    def run_cognitive_task(self, goal, workspace=".", task_id=None, project="", max_iterations=20, **tool_kw):
        from nace.core.cognitive_loop import CognitiveLoop, LoopBudget
        tools = self.make_tools(workspace=workspace, **tool_kw)
        loop = CognitiveLoop(self, tools, LoopBudget(max_iterations=max_iterations))
        return loop.run(goal, task_id=task_id, project=project)
    def close(self):
        # Shutdown trigger: checkpoint before exit.
        try:
            for t in self.tm.list():
                if t["status"] in ("ACTIVE","PAUSED","SLEEPING"):
                    self.tm.checkpoint(t["id"], reason="shutdown")
        finally:
            self.db.close()
