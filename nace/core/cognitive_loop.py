"""Model-driven cognitive loop: goal -> retrieve -> plan -> act(tool) -> observe -> evaluate -> decide.
Deterministic code: budgets, validation, permissions, loop detection, persistence.
Model (or scripted test double): interpretation, planning, action selection, reflection.
Protocol: model returns JSON {"action": tool, "args": {...}, "reasoning": "..."} or
{"finish": true, "summary": "..."} or {"plan": [...]}. Native tool_calls also supported."""
from __future__ import annotations
import hashlib, json, time

SYSTEM_PROMPT = """You are the reasoning engine inside NACE, a persistent cognitive system.
You receive a goal, relevant memories, and tool observations. Respond with ONLY a JSON object:
{"action": "<tool_name>", "args": {...}, "reasoning": "<why>"}
or {"finish": true, "summary": "<what was accomplished>"}
or {"plan": ["step1", "step2"], "action": "<tool_name>", "args": {...}}
Available tools are listed in the user message. Never invent tool names.
Before choosing an approach, consider the retrieved failure/success memories provided.
If a previous approach failed for the same reason, choose a different approach."""

class LoopBudget:
    def __init__(self, max_iterations=20, max_seconds=600, max_retries=3):
        self.max_iterations = max_iterations; self.max_seconds = max_seconds; self.max_retries = max_retries

class CognitiveLoop:
    def __init__(self, orchestrator, tools, budget: LoopBudget = None):
        self.o = orchestrator; self.tools = tools; self.budget = budget or LoopBudget()
    def _log_step(self, tid, kind, detail):
        try: self.o.db.execute("INSERT INTO task_steps(task_id,step,kind,detail,created_at) VALUES(?,?,?,?,?)",
                               (tid, self._step_no(tid), kind, str(detail)[:2000], time.time()))
        except Exception: pass
    def _step_no(self, tid):
        try: return self.o.db.query_one("SELECT COUNT(*) n FROM task_steps WHERE task_id=?", (tid,))["n"] + 1
        except Exception: return 1
    def _record_attempt(self, tid, approach, outcome, detail=""):
        try: self.o.db.execute("INSERT INTO attempts(task_id,approach,outcome,detail,created_at) VALUES(?,?,?,?,?)",
                               (tid, approach, outcome, detail[:1000], time.time()))
        except Exception: pass
    def run(self, goal, task_id=None, project="", completion_check=None):
        o = self.o
        tid = task_id or o.tm.create(goal)
        o.tm.set_status(tid, "ACTIVE")
        self._log_step(tid, "goal", goal)
        # Memory-driven context BEFORE acting (Milestone E)
        fails = o.retriever.search(goal, project=project, types=("failure",), limit=3)
        succs = o.retriever.search(goal, project=project, types=("success", "procedural"), limit=3)
        mem_ctx = o.retriever.format_for_context(fails + succs, 3000)
        tool_list = "\n".join(f"- {t['name']} ({t['permission']}): {t['description']}" for t in self.tools.list())
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT + "\nIdentity: " + o.cfg.identity},
            {"role": "user", "content": f"GOAL: {goal}\n\nRELEVANT MEMORIES (retrieved, with provenance):\n{mem_ctx or '(none)'}\n\nTOOLS:\n{tool_list}\n\nBegin. Respond with JSON only."},
        ]
        seen = {}; retries = 0; t0 = time.time(); plan = []
        for it in range(self.budget.max_iterations):
            if time.time() - t0 > self.budget.max_seconds:
                o.tm.set_status(tid, "BLOCKED"); self._log_step(tid, "stop", "time budget exceeded")
                return {"task_id": tid, "status": "BLOCKED", "reason": "time budget exceeded", "iterations": it}
            # Context pressure check (Milestone F)
            o.ctx.set_section("task", goal + "\n" + "\n".join(str(p) for p in plan))
            o.ctx.rebuild()
            if o.ctx.level() in ("sleep", "emergency"):
                o.tm.checkpoint(tid, reason="context-pressure")
                o.sleep.run(reason="context-pressure", task_id=tid, session_events=o.session_events, project=project)
                o.session_events = []; o.ctx.rebuild()
            # Model decides
            try:
                resp = o.provider.chat(messages)
            except Exception as e:
                retries += 1
                if retries > self.budget.max_retries:
                    o.tm.set_status(tid, "BLOCKED"); self._log_step(tid, "error", f"provider failed: {e}")
                    return {"task_id": tid, "status": "BLOCKED", "reason": f"provider error: {e}", "iterations": it}
                messages.append({"role": "user", "content": f"Provider error: {e}. Retry with a valid JSON action."})
                continue
            content = resp.get("content", "")
            tool_calls = resp.get("tool_calls", []) or []
            action = None
            if tool_calls:
                tc = tool_calls[0]
                args = tc.get("arguments", "{}")
                action = {"action": tc.get("name"), "args": json.loads(args) if isinstance(args, str) else args}
            else:
                action = self._parse(content)
            if action is None:
                messages.append({"role": "user", "content": "Your reply was not valid JSON action. Reply with ONLY the JSON object."})
                retries += 1
                if retries > self.budget.max_retries:
                    o.tm.set_status(tid, "BLOCKED"); return {"task_id": tid, "status": "BLOCKED", "reason": "invalid model output", "iterations": it}
                continue
            if action.get("plan"): plan = action["plan"]; self._log_step(tid, "plan", json.dumps(plan))
            if action.get("finish"):
                o.tm.update(tid, status="COMPLETED", next_action="")
                self._log_step(tid, "finish", action.get("summary", ""))
                o.record_event(f"task-completed-{tid}", action.get("summary", goal), kind="success", project=project)
                o.sleep.run(reason="task-completion", task_id=tid, session_events=o.session_events, project=project)
                o.session_events = []
                return {"task_id": tid, "status": "COMPLETED", "summary": action.get("summary", ""), "iterations": it + 1}
            tool_name, args = action.get("action"), action.get("args", {})
            if not tool_name:
                messages.append({"role": "user", "content": "No action specified. Provide an action or finish."}); continue
            # Loop detection: same tool+args 3x -> escalate
            h = hashlib.sha256(json.dumps({"t": tool_name, "a": args}, sort_keys=True, default=str).encode()).hexdigest()[:16]
            seen[h] = seen.get(h, 0) + 1
            if seen[h] >= 3:
                o.tm.set_status(tid, "BLOCKED"); self._log_step(tid, "stop", f"loop detected: {tool_name} repeated 3x")
                return {"task_id": tid, "status": "BLOCKED", "reason": "loop detected", "iterations": it + 1}
            # Execute (real tool, audited)
            self._record_attempt(tid, f"{tool_name}:{json.dumps(args, default=str)[:120]}", "started")
            result = self.tools.call(tool_name, args, task_id=tid)
            self._log_step(tid, "action", f"{tool_name} {json.dumps(args, default=str)[:300]} -> {result['status']}")
            o.record_event(f"tool-{tool_name}", f"{tool_name} result: {result['result'][:500]} error: {result['error']}", kind="observation", project=project)
            self._record_attempt(tid, f"{tool_name}", result["status"], result["result"][:300])
            # Failure learning hook: tool errors become failure memories
            if result["status"] == "error":
                o.store.add(type="failure", title=f"tool {tool_name} failed", content=f"Tool {tool_name} with args {json.dumps(args, default=str)[:300]} failed: {result['error']}. Goal was: {goal}", project=project, confidence=0.7, importance=0.8, source="cognitive-loop", provenance="observation")
            messages.append({"role": "assistant", "content": content[:2000]})
            messages.append({"role": "user", "content": f"OBSERVATION from {tool_name}: status={result['status']}\n{result['result'][:3000]}\n{result['error']}\nContinue with next JSON action or finish."})
            if completion_check and completion_check(tid):
                o.tm.update(tid, status="COMPLETED")
                return {"task_id": tid, "status": "COMPLETED", "iterations": it + 1}
        o.tm.set_status(tid, "BLOCKED"); self._log_step(tid, "stop", "iteration budget exceeded")
        return {"task_id": tid, "status": "BLOCKED", "reason": "iteration budget exceeded", "iterations": self.budget.max_iterations}
    @staticmethod
    def _parse(content):
        if not content: return None
        s = content.strip()
        # extract first JSON object
        i, j = s.find("{"), s.rfind("}")
        if i < 0 or j < 0: return None
        try: return json.loads(s[i:j+1])
        except Exception: return None
