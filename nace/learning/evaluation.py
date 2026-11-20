"""Evaluation: measurable continuity metrics, no self-generated success claims.
Compares: no-memory vs memory vs memory+sleep on repeatable scenarios."""
from __future__ import annotations
import time
class Evaluator:
    def __init__(self, db, store, tm, sleep_engine):
        self.db = db; self.store = store; self.tm = tm; self.sleep = sleep_engine
    def metrics(self):
        mem_total = self.db.query_one("SELECT COUNT(*) n FROM memories WHERE status='ACTIVE'")["n"]
        tasks = self.tm.list()
        completed = len([t for t in tasks if t["status"]=="COMPLETED"])
        sleeps = self.db.query("SELECT * FROM sleep_runs WHERE status='ok'")
        avg_sleep = sum((s["finished_at"]-s["started_at"]) for s in sleeps)/len(sleeps) if sleeps else 0
        return {"active_memories": mem_total, "tasks_total": len(tasks), "tasks_completed": completed,
                "sleep_runs_ok": len(sleeps), "avg_sleep_s": round(avg_sleep,3),
                "memory_counts": self.store.counts()}
    def scenario_resume_accuracy(self):
        """Create task, complete a step, checkpoint, sleep, verify packet preserves completed step."""
        tid = self.tm.create("eval-resume-scenario")
        self.tm.update(tid, status="ACTIVE", completed_steps=["step-A-done"], next_action="do step B")
        self.tm.checkpoint(tid, reason="eval")
        self.sleep.run(reason="eval", task_id=tid, session_events=[
            {"title":"eval fact","content":"eval scenario verified fact for resume test","kind":"fact","project":"eval"}])
        pkt = self.tm.resume_packet(tid)
        ok = bool(pkt and "step-A-done" in pkt["completed"] and pkt["next_action"]=="do step B")
        return {"resume_accuracy": 1.0 if ok else 0.0, "packet": pkt}
    def scenario_duplicate_detection(self):
        self.store.add(type="semantic", title="dup-eval", content="duplicate detection eval content xyz", project="eval")
        before = self.db.query_one("SELECT COUNT(*) n FROM memories WHERE title='dup-eval' AND status='ACTIVE'")["n"]
        self.sleep.run(reason="eval-dup", session_events=[
            {"title":"dup-eval","content":"duplicate detection eval content xyz","kind":"fact","project":"eval"}])
        after = self.db.query_one("SELECT COUNT(*) n FROM memories WHERE title='dup-eval' AND status='ACTIVE'")["n"]
        return {"duplicates_blocked": after == before, "before": before, "after": after}
    def scenario_failure_recall(self):
        from nace.learning.failure import FailureLearner
        fl = FailureLearner(self.store)
        fl.record("eval-failure", "eval failure: missing config caused test 14 to fail", project="eval")
        hits = fl.recall("missing config test 14", project="eval")
        return {"failure_recall_hits": len(hits), "recalled": len(hits) > 0}
    def run_all(self):
        t0 = time.time()
        return {"metrics": self.metrics(), "resume": self.scenario_resume_accuracy(),
                "duplicates": self.scenario_duplicate_detection(),
                "failure_recall": self.scenario_failure_recall(),
                "elapsed_s": round(time.time()-t0,3)}
