"""End-to-end demo in ONE process (session events live in memory):
task -> failure -> sleep -> resume -> retrieval. Run: python3 scripts/demo.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.models.providers import MockProvider
from nace.learning.failure import FailureLearner

o = Orchestrator(NaceConfig(data_dir="./data-demo", context_budget=2048), provider=MockProvider())
tid = o.tm.create("Universal Game Engine - Runtime Research")
o.tm.set_status(tid, "ACTIVE")
o.record_event("test14-fail", "Test 14 failed because configuration file Y was missing", kind="failure", project="uge")
o.record_event("fix", "Restoring configuration file Y allowed test 14 to pass", kind="success", project="uge")
o.record_event("fact", "Test suite X requires configuration file Y", kind="fact", project="uge")
o.record_event("proc", "Before running test suite X, verify configuration file Y exists", kind="procedure", project="uge", reusable=True)
o.tm.update(tid, completed_steps=["runtime research started"], next_action="Compare Godot and Bevy runtime integration")
rep = o.sleep_now(reason="demo", task_id=tid, project="uge")
print("SLEEP REPORT:", {k: rep[k] for k in ("reason","experiences_analyzed","new_episodic","new_semantic","procedures_updated","duplicates_rejected","checkpoint","resume_state")})
print("RESUME PACKET:", o.tm.resume_packet(tid))
print("RECALL failure:", [m["title"] for m in FailureLearner(o.store).recall("missing config test 14", project="uge")])
print("STATUS tasks:", o.tm.list())
o.close()
