import os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.context.manager import ContextManager
from nace.core.hardware import detect_hardware
from nace.models.registry import recommend, CATALOG
from nace.models.providers import MockProvider

def make_orch():
    d = tempfile.mkdtemp()
    cfg = NaceConfig(data_dir=d, context_budget=2048)
    return Orchestrator(cfg, provider=MockProvider())

class TestNace(unittest.TestCase):
    def test_hardware_detection(self):
        hw = detect_hardware(".")
        self.assertIn(hw.mode, ("low","normal","high")); self.assertGreater(hw.ram_total_mb, 0)
    def test_model_recommend_fits_ram(self):
        hw = detect_hardware("."); rec = recommend(hw)
        self.assertIn(rec["name"], [m["name"] for m in CATALOG])
    def test_memory_crud_and_dedup(self):
        o = make_orch()
        mid = o.store.add(type="semantic", title="t1", content="hello world fact one")
        self.assertIsNotNone(o.store.get(mid))
        self.assertIsNotNone(o.store.find_duplicate("t1","hello world fact one"))
        o.close()
    def test_retrieval(self):
        o = make_orch()
        o.store.add(type="semantic", title="physics", content="physics collision uses broadphase", project="game")
        hits = o.retriever.search("physics collision", project="game")
        self.assertTrue(any("physics" in h["content"] for h in hits))
        o.close()
    def test_conflict_supersede(self):
        o = make_orch()
        old = o.store.add(type="semantic", title="engine", content="Project uses Godot 4.4")
        new = o.store.add(type="semantic", title="engine", content="Project migrated to Godot 4.5", supersedes=old)
        self.assertEqual(o.store.get(old)["status"], "SUPERSEDED")
        self.assertEqual(o.store.get(new)["status"], "ACTIVE")
        o.close()
    def test_task_persistence_and_resume(self):
        o = make_orch()
        tid = o.tm.create("build engine")
        o.tm.update(tid, status="ACTIVE", completed_steps=["s1"], next_action="s2")
        o.tm.checkpoint(tid, reason="test")
        pkt = o.tm.resume_packet(tid)
        self.assertEqual(pkt["completed"], ["s1"]); self.assertEqual(pkt["next_action"], "s2")
        o.close()
    def test_sleep_pipeline(self):
        o = make_orch()
        tid = o.tm.create("sleep test task")
        o.tm.update(tid, status="ACTIVE", completed_steps=["done-1"], next_action="next-1")
        rep = o.sleep.run(reason="test", task_id=tid, session_events=[
            {"title":"e1","content":"attempted test 14 and it failed due to missing config","kind":"failure","project":"p"},
            {"title":"f1","content":"test suite X requires configuration file Y verified","kind":"fact","project":"p"},
            {"title":"p1","content":"before running test suite X verify configuration file Y exists","kind":"procedure","project":"p"},
        ], project="p")
        self.assertEqual(rep["experiences_analyzed"], 3)
        self.assertGreater(rep["new_episodic"]+rep["new_semantic"]+rep["procedures_updated"], 0)
        self.assertEqual(rep["checkpoint"], "saved")
        o.close()
    def test_sleep_idempotent_duplicates(self):
        o = make_orch()
        ev = [{"title":"dup","content":"duplicate content for idempotency check","kind":"fact"}]
        o.sleep.run(reason="t1", session_events=ev)
        rep2 = o.sleep.run(reason="t2", session_events=ev)
        self.assertGreaterEqual(rep2["duplicates_rejected"], 1)
        o.close()
    def test_context_thresholds(self):
        c = ContextManager(budget=1000, reserve_output=200)
        c.set_section("identity", "x"*4000)  # ~1000 tokens > usable 800
        c.rebuild()
        self.assertIn(c.level(), ("sleep","emergency","checkpoint"))
    def test_failure_recall(self):
        o = make_orch()
        from nace.learning.failure import FailureLearner
        fl = FailureLearner(o.store)
        fl.record("f", "runtime missing dependency caused crash; fix install dependency first", project="p")
        self.assertTrue(len(fl.recall("missing dependency crash", project="p")) > 0)
        o.close()
    def test_evaluation_scenarios(self):
        o = make_orch()
        from nace.learning.evaluation import Evaluator
        res = Evaluator(o.db, o.store, o.tm, o.sleep).run_all()
        self.assertEqual(res["resume"]["resume_accuracy"], 1.0)
        self.assertTrue(res["duplicates"]["duplicates_blocked"])
        self.assertTrue(res["failure_recall"]["recalled"])
        o.close()
    def test_run_task_with_mock(self):
        o = make_orch()
        out = o.run_task("research runtime architecture")
        self.assertIn("MOCK-RESPONSE", out["output"])
        self.assertIsNotNone(o.tm.get(out["task_id"]))
        o.close()
    def test_integrity(self):
        o = make_orch()
        self.assertEqual(o.db.integrity_check(), "ok")
        o.close()

if __name__ == "__main__":
    unittest.main()
