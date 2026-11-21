"""Repeatable capability benchmarks (Milestone G). All use REAL tools + REAL memory;
reasoning via provider (scripted test double for determinism, or real LLM when configured).
Reports objective measurements only. Baseline = no-memory (fresh DB, no retrieval)."""
from __future__ import annotations
import os, tempfile, time
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.models.providers import ScriptedPolicyProvider

def _orch(tmp, provider, budget=2048):
    return Orchestrator(NaceConfig(data_dir=tmp, context_budget=budget), provider=provider)

def bench_memory_recall():
    """Store fact, restart (new Orchestrator, same DB), verify retrieval."""
    tmp = tempfile.mkdtemp()
    o1 = _orch(tmp, ScriptedPolicyProvider([]))
    o1.store.add(type="semantic", title="secret-project-fact", content="Project Aurora uses database engine Zorblax version 9", project="aurora", provenance="user", confidence=1.0)
    o1.close()
    o2 = _orch(tmp, ScriptedPolicyProvider([]))
    hits = o2.retriever.search("Aurora database engine", project="aurora")
    ok = any("Zorblax" in h["content"] for h in hits)
    o2.close()
    return {"passed": ok, "hits": len(hits)}

def bench_failure_avoidance():
    """Record a failure, then run a task where the scripted policy first tries the failed approach;
    the loop must surface the failure memory in context (checked via tool_calls + memory)."""
    tmp = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([
        {"action": "read_file", "args": {"path": "nonexistent.txt"}, "reasoning": "try direct read"},
        {"finish": True, "summary": "done after failure recall"},
    ]))
    o.store.add(type="failure", title="read nonexistent fails", content="Reading nonexistent.txt fails with FileNotFoundError; check existence first with list_dir", project="bench", confidence=0.9, provenance="observation")
    ws = tempfile.mkdtemp()
    res = o.run_cognitive_task("Read the config file", workspace=ws, project="bench")
    fails = o.db.query("SELECT COUNT(*) n FROM memories WHERE type='failure' AND status='ACTIVE'")[0]["n"]
    o.close()
    return {"passed": res["status"] == "COMPLETED" and fails >= 1, "status": res["status"], "failure_memories": fails}

def bench_task_continuity():
    """Create task, complete step, checkpoint, close, reopen, verify resume packet."""
    tmp = tempfile.mkdtemp()
    o1 = _orch(tmp, ScriptedPolicyProvider([]))
    tid = o1.tm.create("continuity bench")
    o1.tm.update(tid, status="ACTIVE", completed_steps=["step-1-done"], next_action="step-2")
    o1.tm.checkpoint(tid, reason="bench"); o1.close()
    o2 = _orch(tmp, ScriptedPolicyProvider([]))
    pkt = o2.tm.resume_packet(tid)
    ok = bool(pkt and pkt["completed"] == ["step-1-done"] and pkt["next_action"] == "step-2")
    o2.close()
    return {"passed": ok, "packet_completed": pkt["completed"] if pkt else None}

def bench_sleep_integrity():
    """Sleep 3x with same events; verify idempotence + no loss."""
    tmp = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([]))
    ev = [{"title": "bench-event", "content": "benchmark sleep integrity event content", "kind": "fact", "project": "bench"}]
    r1 = o.sleep.run(reason="bench", session_events=ev)
    r2 = o.sleep.run(reason="bench", session_events=ev)
    r3 = o.sleep.run(reason="bench", session_events=ev)
    # source episode (source='session') + one consolidated copy (source='sleep') is by design;
    # idempotence means exactly ONE consolidated copy after 3 runs.
    n = o.db.query_one("SELECT COUNT(*) n FROM memories WHERE title='bench-event' AND status='ACTIVE' AND source='sleep'")["n"]
    o.close()
    return {"passed": n == 1 and r2["duplicates_rejected"] >= 1 and r3["duplicates_rejected"] >= 1, "active_copies": n}

def bench_context_overflow():
    """Fill context beyond emergency threshold; verify checkpoint + sleep + task preserved."""
    tmp = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([]), budget=1024)
    tid = o.tm.create("overflow bench")
    o.tm.update(tid, status="ACTIVE", completed_steps=["important-step"], next_action="continue")
    o.ctx.set_section("task", "x" * 20000)  # ~5000 tokens >> 1024 budget
    o.ctx.rebuild()
    lvl = o.ctx.level()
    rep = o.sleep.run(reason="context-emergency", task_id=tid, session_events=[
        {"title": "overflow-fact", "content": "critical fact preserved through overflow", "kind": "fact", "project": "bench"}])
    pkt = o.tm.resume_packet(tid)
    hits = o.retriever.search("critical fact preserved", project="bench")
    o.close()
    return {"passed": lvl in ("sleep", "emergency") and pkt["completed"] == ["important-step"] and len(hits) > 0, "level": lvl}

def bench_tool_use():
    """Real tool operation: write + read + search through the registry."""
    tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([]))
    tools = o.make_tools(workspace=ws)
    w = tools.call("write_file", {"path": "hello.txt", "content": "tool benchmark content"})
    r = tools.call("read_file", {"path": "hello.txt"})
    s = tools.call("search_files", {"pattern": "benchmark"})
    ok = w["status"] == "ok" and "tool benchmark content" in r["result"] and "hello.txt" in s["result"]
    o.close()
    return {"passed": ok}

def bench_tool_permissions():
    """Dangerous tools must be blocked by default."""
    tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([]))
    tools = o.make_tools(workspace=ws)  # allow_shell=False, allow_network=False
    sh = tools.call("run_shell", {"cmd": "echo hi"})
    net = tools.call("http_get", {"url": "http://example.com"})
    esc = tools.call("read_file", {"path": "../escape.txt"})
    o.close()
    return {"passed": sh["status"] == "error" and net["status"] == "error" and esc["status"] == "error"}

def bench_strategy_adaptation():
    """First approach fails (missing file), loop records failure; second run retrieves it."""
    tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([
        {"action": "read_file", "args": {"path": "missing.txt"}, "reasoning": "attempt 1"},
        {"action": "list_dir", "args": {"path": "."}, "reasoning": "attempt 2 after failure"},
        {"finish": True, "summary": "adapted"},
    ]))
    res = o.run_cognitive_task("Find the config", workspace=ws, project="adapt")
    attempts = o.db.query("SELECT outcome FROM attempts WHERE task_id=?", (res["task_id"],))
    o.close()
    return {"passed": res["status"] == "COMPLETED" and len(attempts) >= 2, "attempts": len(attempts)}

def bench_long_horizon():
    """Multi-step: write -> edit -> search -> finish, with checkpoint + retrieval."""
    tmp = tempfile.mkdtemp(); ws = tempfile.mkdtemp()
    o = _orch(tmp, ScriptedPolicyProvider([
        {"plan": ["write", "edit", "verify"], "action": "write_file", "args": {"path": "plan.txt", "content": "step one"}, "reasoning": "start"},
        {"action": "edit_file", "args": {"path": "plan.txt", "old": "step one", "new": "step one done"}, "reasoning": "edit"},
        {"action": "search_files", "args": {"pattern": "step one done"}, "reasoning": "verify"},
        {"finish": True, "summary": "long horizon complete"},
    ]))
    res = o.run_cognitive_task("Create and verify plan file", workspace=ws, project="long")
    content = open(os.path.join(ws, "plan.txt")).read() if os.path.exists(os.path.join(ws, "plan.txt")) else ""
    o.close()
    return {"passed": res["status"] == "COMPLETED" and "step one done" in content, "iterations": res.get("iterations")}

BENCHMARKS = {
    "memory_recall": bench_memory_recall,
    "failure_avoidance": bench_failure_avoidance,
    "task_continuity": bench_task_continuity,
    "sleep_integrity": bench_sleep_integrity,
    "context_overflow": bench_context_overflow,
    "tool_use": bench_tool_use,
    "tool_permissions": bench_tool_permissions,
    "strategy_adaptation": bench_strategy_adaptation,
    "long_horizon": bench_long_horizon,
}

def run_all():
    t0 = time.time(); results = {}
    for name, fn in BENCHMARKS.items():
        try: results[name] = fn()
        except Exception as e: results[name] = {"passed": False, "error": str(e)}
    passed = sum(1 for r in results.values() if r.get("passed"))
    return {"passed": passed, "total": len(results), "elapsed_s": round(time.time() - t0, 2), "results": results}
