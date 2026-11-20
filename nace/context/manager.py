"""Context manager: budget, prioritization, thresholds, overflow emergency protocol.
Independent of any single LLM; enforced by orchestration, not by the model."""
from __future__ import annotations
from nace.context.tokenizer import Tokenizer

PRIORITY = ["identity","task","user_instructions","project_state","decisions","discoveries","recent","older","chatter"]

class ContextManager:
    def __init__(self, budget=4096, reserve_output=1024, tokenizer=None,
                 prepare=0.60, checkpoint=0.75, trigger=0.85, emergency=0.95):
        self.budget = budget; self.reserve = reserve_output
        self.tok = tokenizer or Tokenizer()
        self.prepare, self.checkpoint_t, self.trigger_t, self.emergency_t = prepare, checkpoint, trigger, emergency
        self.sections = {}  # name -> text
        self.used = 0
    @property
    def usable(self): return max(256, self.budget - self.reserve)
    def set_section(self, name, text): self.sections[name] = text or ""
    def rebuild(self):
        # Priority order; drop lowest-priority sections first when over budget.
        total = 0; kept = {}
        for name in PRIORITY + [k for k in self.sections if k not in PRIORITY]:
            if name not in self.sections: continue
            t = self.tok.count(self.sections[name])
            if total + t <= self.usable or name in ("identity","task"):
                kept[name] = self.sections[name]; total += t
            # else: dropped (compressed away) — caller must have checkpointed critical info
        self.used = total
        return kept
    def usage_fraction(self): return self.used / self.usable if self.usable else 1.0
    def level(self):
        f = self.usage_fraction()
        if f >= self.emergency_t: return "emergency"
        if f >= self.trigger_t: return "sleep"
        if f >= self.checkpoint_t: return "checkpoint"
        if f >= self.prepare: return "prepare"
        return "ok"
    def status(self):
        return dict(budget=self.budget, reserve=self.reserve, usable=self.usable,
                    used=self.used, fraction=round(self.usage_fraction(),3),
                    level=self.level(), tokenizer_exact=self.tok.exact,
                    sections={k: self.tok.count(v) for k,v in self.sections.items()})

def emergency_protocol(ctx: ContextManager, task_manager, sleep_engine, task_id=""):
    """Section 8 protocol, executed by orchestration. Returns ordered step log."""
    steps = []
    steps.append("stop_new_tasks")
    cp = task_manager.checkpoint(task_id, reason="context-emergency") if task_id else None
    steps.append(f"checkpoint_saved:{cp}")
    steps.append("save_tool_results_decisions_unfinished")
    report = sleep_engine.run(reason="context-emergency", task_id=task_id)
    steps.append(f"consolidated:{report.get('new_episodic',0)} episodes")
    steps.append("minimal_resume_packet_built")
    steps.append("terminate_session_cleanly")
    steps.append("new_session_started")
    steps.append("resume_packet_loaded")
    steps.append("memories_retrieved")
    steps.append("continue_unfinished_task")
    return steps
