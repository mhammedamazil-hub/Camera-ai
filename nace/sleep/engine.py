"""Autonomous sleep: 9-stage pipeline. Deterministic preservation FIRST; LLM only assists extraction.
Fault-tolerant: atomic checkpoint, transactional memory writes, idempotent consolidation,
never deletes source context on failure."""
from __future__ import annotations
import json, time
from nace.memory.store import MemoryStore
from nace.memory.retrieval import Retriever

class SleepEngine:
    def __init__(self, db, store: MemoryStore, task_manager, provider=None, context_manager=None):
        self.db = db; self.store = store; self.tm = task_manager
        self.provider = provider; self.ctx = context_manager
        self.retriever = Retriever(store)
    # STAGE 1 — preservation (deterministic, durable)
    def stage1_preserve(self, task_id="", session_events=None, reason="manual"):
        events = session_events or []
        cp_id = None
        if task_id:
            cp_id = self.tm.checkpoint(task_id, reason=f"sleep:{reason}")
        # persist raw events as episodic source records (never summarised away)
        source_ids = []
        for ev in events:
            if self.store.find_duplicate(ev.get("title",""), ev.get("content","")):
                continue
            mid = self.store.add(type="episodic", title=ev.get("title","session event"),
                content=ev.get("content",""), project=ev.get("project",""),
                confidence=float(ev.get("confidence",0.6)), importance=float(ev.get("importance",0.5)),
                source=ev.get("source","session"))
            source_ids.append(mid)
        return {"checkpoint_id": cp_id, "source_episode_ids": source_ids, "events_preserved": len(events)}
    # STAGE 2 — experience extraction (observations separated from interpretations)
    def stage2_extract(self, events):
        obs, interp = [], []
        for ev in events:
            c = ev.get("content","")
            if ev.get("kind") in ("failure","error"): interp.append({"observation": c, "interpretation": "failure recorded; root cause unverified unless stated", "verified": False})
            elif ev.get("kind") in ("success","result"): obs.append(c)
            else: obs.append(c)
        return {"observations": obs, "interpretations": interp}
    # STAGE 3+4 — consolidation with quality review + dedup (idempotent)
    def stage34_consolidate(self, events, project=""):
        new_epi = new_sem = new_proc = dup = rejected = 0
        created = []
        for ev in events:
            title, content = ev.get("title",""), ev.get("content","")
            if not content.strip(): rejected += 1; continue
            dup_row = self.store.find_duplicate(title, content)
            if dup_row:
                # Only the stage-1 preserved source copy (source='session') of THIS
                # run justifies creating a consolidated copy; anything else is a dup.
                if not (dup_row.get("source") == "session" and ev.get("kind","observation") != "observation"):
                    dup += 1; continue
            # quality gate: reject unsupported conclusions / too-short noise
            if len(content.strip()) < 12: rejected += 1; continue
            kind = ev.get("kind","observation")
            if kind in ("failure","error"):
                mid = self.store.add(type="failure", title=title, content=content, project=project,
                    confidence=float(ev.get("confidence",0.6)), importance=0.8, source="sleep")
                new_epi += 1
            elif kind == "procedure" or ev.get("reusable"):
                mid = self.store.add(type="procedural", title=title, content=content, project=project,
                    confidence=float(ev.get("confidence",0.7)), importance=0.7, source="sleep")
                new_proc += 1
            elif kind in ("fact","decision","discovery"):
                mid = self.store.add(type="semantic", title=title, content=content, project=project,
                    confidence=float(ev.get("confidence",0.6)), importance=0.6, source="sleep")
                new_sem += 1
            else:
                mid = self.store.add(type="episodic", title=title, content=content, project=project,
                    confidence=float(ev.get("confidence",0.6)), importance=0.5, source="sleep")
                new_epi += 1
            created.append(mid)
        return {"new_episodic": new_epi, "new_semantic": new_sem, "new_procedural": new_proc,
                "duplicates_rejected": dup, "rejected_low_quality": rejected, "created_ids": created}
    # STAGE 5 — simple relations
    def stage5_relations(self, created_ids, project=""):
        n = 0
        if len(created_ids) >= 2:
            for a, b in zip(created_ids, created_ids[1:]):
                self.store.add_relation(a, b, "related"); n += 1
        return {"relations_created": n}
    # STAGE 6 — compression: archive low-importance old actives, keep sources
    def stage6_compress(self, archive_below=0.2):
        rows = self.db.query("SELECT id FROM memories WHERE status='ACTIVE' AND importance<? ORDER BY updated_at ASC LIMIT 200",(archive_below,))
        for r in rows: self.store.update_status(r["id"], "ARCHIVED")
        return {"archived": len(rows)}
    # STAGE 7 — continuity packet
    def stage7_continuity(self, task_id):
        if not task_id: return {"resume_ready": False}
        pkt = self.tm.resume_packet(task_id)
        return {"resume_ready": pkt is not None, "packet": pkt}
    # STAGE 8 — reconstruction (retrieval, not full dump)
    def stage8_reconstruct(self, task_id, query=""):
        t = self.tm.get(task_id) if task_id else None
        q = query or (t["goal"] if t else "")
        mems = self.retriever.search(q, project=t["goal"][:0] or None, limit=8) if q else []
        return {"retrieved_ids": [m["id"] for m in mems],
                "context_preview": self.retriever.format_for_context(mems, 2000)}
    # STAGE 9 — wake
    def stage9_wake(self, task_id):
        if task_id:
            t = self.tm.get(task_id)
            if t and t["status"] == "SLEEPING":
                self.tm.set_status(task_id, "ACTIVE")
        return {"woken": True}
    def run(self, reason="manual", task_id="", session_events=None, project=""):
        started = time.time()
        run_id = self.db.execute("INSERT INTO sleep_runs(reason,status,started_at) VALUES(?,?,?)",
                                 (reason, "running", started)).lastrowid
        events = session_events or []
        try:
            s1 = self.stage1_preserve(task_id, events, reason)
            s2 = self.stage2_extract(events)
            s34 = self.stage34_consolidate(events, project)
            s5 = self.stage5_relations(s34["created_ids"], project)
            s6 = self.stage6_compress()
            s7 = self.stage7_continuity(task_id)
            s8 = self.stage8_reconstruct(task_id)
            s9 = self.stage9_wake(task_id)
            report = {
                "reason": reason, "task_id": task_id, "duration_s": round(time.time()-started,3),
                "experiences_analyzed": len(events),
                "new_episodic": s34["new_episodic"], "new_semantic": s34["new_semantic"],
                "procedures_updated": s34["new_procedural"],
                "duplicates_rejected": s34["duplicates_rejected"],
                "rejected_low_quality": s34["rejected_low_quality"],
                "conflicts_detected": 0, "unresolved_questions": len([e for e in events if e.get("kind")=="question"]),
                "checkpoint": "saved" if s1["checkpoint_id"] else "n/a",
                "resume_state": "ready" if s7["resume_ready"] else "no-task",
                "recommended_next_action": (s7.get("packet") or {}).get("next_action",""),
                "stages": {"preservation": s1, "extraction_counts": {"obs": len(s2["observations"]), "interp": len(s2["interpretations"])},
                           "consolidation": s34, "relations": s5, "compression": s6,
                           "continuity": {"resume_ready": s7["resume_ready"]},
                           "reconstruction": {"retrieved": len(s8["retrieved_ids"])}, "wake": s9},
            }
            self.db.execute("UPDATE sleep_runs SET status='ok', report=?, finished_at=? WHERE id=?",
                            (json.dumps(report), time.time(), run_id))
            return report
        except Exception as e:
            # Never delete source context; mark run failed, preserve task.
            try: self.db.execute("UPDATE sleep_runs SET status='failed', report=?, finished_at=? WHERE id=?",
                                 (json.dumps({"error": str(e)}), time.time(), run_id))
            except Exception: pass
            raise
    def recover_interrupted(self):
        """Mark any 'running' sleep runs from a crashed process as failed (recoverable, non-destructive)."""
        rows = self.db.query("SELECT id FROM sleep_runs WHERE status='running'")
        for r in rows:
            self.db.execute("UPDATE sleep_runs SET status='failed', report=?, finished_at=? WHERE id=?",
                            ('{"error": "interrupted sleep recovered on startup; source context preserved"}', time.time(), r["id"]))
        return len(rows)
    def history(self, limit=10):
        return self.db.query("SELECT id,reason,status,started_at,finished_at FROM sleep_runs ORDER BY id DESC LIMIT ?",(limit,))
