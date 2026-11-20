"""Persistent task state machine. Sleep never resets task state."""
from __future__ import annotations
import json, time, uuid
STATUSES = ("CREATED","PLANNED","ACTIVE","PAUSED","SLEEPING","BLOCKED","COMPLETED","FAILED")
class TaskManager:
    def __init__(self, db): self.db = db
    def create(self, goal, priority=0, task_id=None):
        tid = task_id or ("task-" + uuid.uuid4().hex[:8])
        now = time.time()
        self.db.execute("INSERT INTO tasks(id,goal,priority,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                        (tid,goal,priority,"CREATED",now,now))
        return tid
    def get(self, tid):
        r = self.db.query_one("SELECT * FROM tasks WHERE id=?",(tid,))
        if not r: return None
        for k in ("plan","completed_steps","dependencies","findings","errors","files_changed","tests"):
            try: r[k] = json.loads(r[k] or "[]")
            except Exception: r[k] = []
        try: r["checkpoint"] = json.loads(r["checkpoint"] or "{}")
        except Exception: r["checkpoint"] = {}
        return r
    def list(self, status=None):
        q = "SELECT id,goal,status,priority,updated_at FROM tasks"
        p = []
        if status: q += " WHERE status=?"; p.append(status)
        q += " ORDER BY priority DESC, updated_at DESC"
        return self.db.query(q, tuple(p))
    def update(self, tid, **kw):
        allowed = {"goal","priority","status","plan","completed_steps","current_step","dependencies",
                   "findings","errors","files_changed","tests","next_action","checkpoint"}
        sets, vals = [], []
        for k,v in kw.items():
            if k not in allowed: continue
            if k in ("plan","completed_steps","dependencies","findings","errors","files_changed","tests","checkpoint"):
                v = json.dumps(v)
            if k == "status": assert v in STATUSES
            sets.append(f"{k}=?"); vals.append(v)
        if not sets: return
        vals += [time.time(), tid]
        self.db.execute(f"UPDATE tasks SET {', '.join(sets)}, updated_at=? WHERE id=?", tuple(vals))
    def set_status(self, tid, status): self.update(tid, status=status)
    def checkpoint(self, tid, reason="manual", extra=None):
        t = self.get(tid)
        if not t: return None
        payload = dict(t); payload["reason"] = reason; payload["extra"] = extra or {}
        payload["saved_at"] = time.time()
        # Atomic: single transaction insert; never overwrite prior checkpoints.
        cur = self.db.execute("INSERT INTO checkpoints(task_id,reason,payload,created_at) VALUES(?,?,?,?)",
                              (tid, reason, json.dumps(payload, default=str), time.time()))
        self.update(tid, checkpoint={"last_checkpoint_id": cur.lastrowid, "reason": reason})
        return cur.lastrowid
    def latest_checkpoint(self, tid):
        return self.db.query_one("SELECT * FROM checkpoints WHERE task_id=? ORDER BY id DESC LIMIT 1",(tid,))
    def resume_packet(self, tid):
        """Stage 7 continuation packet: answers what/why/done/evidence/failed/next/avoid/files/tools."""
        t = self.get(tid)
        if not t: return None
        cp = self.latest_checkpoint(tid)
        return {
            "task_id": tid, "goal": t["goal"], "status": t["status"],
            "completed": t["completed_steps"], "current_step": t["current_step"],
            "findings": t["findings"], "errors": t["errors"], "tests": t["tests"],
            "files_changed": t["files_changed"], "next_action": t["next_action"],
            "checkpoint_id": cp["id"] if cp else None,
            "avoid_repeating": [f"completed step: {s}" for s in t["completed_steps"]],
        }
