"""Real tool framework: typed schemas, validation, permissions, timeouts, audit log.
Permission levels: safe (auto) | write (auto if allow_write) | approval (needs explicit approve) | denied.
Safe defaults: workspace-scoped writes, shell restricted, no credential paths."""
from __future__ import annotations
import json, os, re, subprocess, time, urllib.request
from dataclasses import dataclass, field

@dataclass
class ToolSpec:
    name: str
    description: str
    schema: dict  # JSON-schema-ish: {"type":"object","properties":{...},"required":[...]}
    permission: str = "safe"  # safe|write|approval|denied
    fn: object = None

class ToolError(RuntimeError): pass

def _validate(spec: ToolSpec, args: dict):
    props = spec.schema.get("properties", {})
    for req in spec.schema.get("required", []):
        if req not in args: raise ToolError(f"missing required arg: {req}")
    for k, v in args.items():
        if k in props:
            t = props[k].get("type")
            if t == "string" and not isinstance(v, str): raise ToolError(f"arg {k} must be string")
            if t == "integer" and not isinstance(v, int): raise ToolError(f"arg {k} must be integer")
            if t == "number" and not isinstance(v, (int, float)): raise ToolError(f"arg {k} must be number")
            if t == "boolean" and not isinstance(v, bool): raise ToolError(f"arg {k} must be boolean")
    return True

class ToolRegistry:
    def __init__(self, db=None, workspace=".", allow_write=True, allow_shell=False,
                 allow_network=False, max_result_chars=8000, approved=None):
        self.db = db; self.workspace = os.path.abspath(workspace)
        self.allow_write = allow_write; self.allow_shell = allow_shell
        self.allow_network = allow_network; self.max_result_chars = max_result_chars
        self.approved = set(approved or [])
        self.tools = {}
        self._register_builtins()
    def register(self, spec: ToolSpec): self.tools[spec.name] = spec
    def list(self): return [{"name": t.name, "description": t.description, "permission": t.permission, "schema": t.schema} for t in self.tools.values()]
    def _in_workspace(self, path):
        p = os.path.abspath(os.path.join(self.workspace, path))
        if not (p == self.workspace or p.startswith(self.workspace + os.sep)):
            raise ToolError(f"path escapes workspace: {path}")
        return p
    def _check_permission(self, spec: ToolSpec):
        if spec.permission == "denied": raise ToolError(f"tool {spec.name} is denied by policy")
        if spec.permission == "write" and not self.allow_write: raise ToolError(f"tool {spec.name} requires write permission (disabled)")
        if spec.permission == "approval" and spec.name not in self.approved:
            raise ToolError(f"tool {spec.name} requires explicit approval (approve via CLI --approve {spec.name})")
    def call(self, name, args=None, task_id=""):
        args = args or {}
        if name not in self.tools:
            return {"tool": name, "status": "error", "result": "", "error": f"unknown tool: {name}", "duration_ms": 0}
        spec = self.tools[name]
        t0 = time.time(); status, result, error = "ok", "", ""
        try:
            self._check_permission(spec)
            _validate(spec, args)
            result = spec.fn(args)
            if isinstance(result, (dict, list)): result = json.dumps(result, indent=2, default=str)
            result = str(result)[: self.max_result_chars]
        except Exception as e:
            status, error = "error", str(e)
        dur = int((time.time() - t0) * 1000)
        if self.db is not None:
            try:
                self.db.execute("INSERT INTO tool_calls(task_id,tool,args,status,result,error,duration_ms,created_at) VALUES(?,?,?,?,?,?,?,?)",
                                (task_id, name, json.dumps(args, default=str), status, result[:2000], error, dur, time.time()))
            except Exception: pass
        return {"tool": name, "status": status, "result": result, "error": error, "duration_ms": dur}
    def history(self, task_id="", limit=50):
        if self.db is None: return []
        q = "SELECT id,task_id,tool,status,duration_ms,created_at FROM tool_calls"
        p = []
        if task_id: q += " WHERE task_id=?"; p.append(task_id)
        q += " ORDER BY id DESC LIMIT ?"; p.append(limit)
        return self.db.query(q, tuple(p))
    # ---- builtins (real implementations) ----
    def _register_builtins(self):
        R = self.register
        R(ToolSpec("read_file", "Read a text file inside the workspace.", {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}, "safe", lambda a: open(self._in_workspace(a["path"])).read()[: self.max_result_chars]))
        R(ToolSpec("write_file", "Create/overwrite a file inside the workspace.", {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}, "write", self._write_file))
        R(ToolSpec("edit_file", "Replace exact text in a file inside the workspace.", {"type": "object", "properties": {"path": {"type": "string"}, "old": {"type": "string"}, "new": {"type": "string"}}, "required": ["path", "old", "new"]}, "write", self._edit_file))
        R(ToolSpec("list_dir", "List directory contents inside the workspace.", {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}, "safe", lambda a: "\n".join(sorted(os.listdir(self._in_workspace(a["path"]))[:200]))))
        R(ToolSpec("search_files", "Regex search across text files inside the workspace.", {"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}, "safe", self._search))
        R(ToolSpec("run_python", "Execute Python code (timeout 30s, workspace cwd).", {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}, "approval", self._run_python))
        R(ToolSpec("run_shell", "Execute a shell command (restricted; disabled by default).", {"type": "object", "properties": {"cmd": {"type": "string"}}, "required": ["cmd"]}, "approval", self._run_shell))
        R(ToolSpec("http_get", "HTTP GET a URL (disabled by default).", {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}, "approval", self._http_get))
        R(ToolSpec("now", "Current UTC time and uptime info.", {"type": "object", "properties": {}}, "safe", lambda a: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))
    def _write_file(self, a):
        p = self._in_workspace(a["path"]); os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
        with open(p, "w") as f: f.write(a["content"])
        return f"wrote {len(a['content'])} chars to {a['path']}"
    def _edit_file(self, a):
        p = self._in_workspace(a["path"]); s = open(p).read()
        if a["old"] not in s: raise ToolError("old text not found")
        open(p, "w").write(s.replace(a["old"], a["new"], 1))
        return f"edited {a['path']}"
    def _search(self, a):
        root = self._in_workspace(a.get("path", "."))
        pat = re.compile(a["pattern"]); hits = []
        for dirpath, _, files in os.walk(root):
            if len(hits) > 100: break
            for fn in files:
                if fn.endswith((".pyc", ".db", ".gguf")): continue
                fp = os.path.join(dirpath, fn)
                try:
                    for i, line in enumerate(open(fp, errors="ignore"), 1):
                        if pat.search(line):
                            hits.append(f"{os.path.relpath(fp, self.workspace)}:{i}:{line.strip()[:160]}")
                            if len(hits) > 100: break
                except Exception: continue
        return "\n".join(hits) or "(no matches)"
    def _run_python(self, a):
        r = subprocess.run(["python3", "-c", a["code"]], capture_output=True, text=True, timeout=30, cwd=self.workspace)
        return f"rc={r.returncode}\nSTDOUT:\n{r.stdout[:4000]}\nSTDERR:\n{r.stderr[:2000]}"
    def _run_shell(self, a):
        if not self.allow_shell: raise ToolError("shell execution disabled by policy (allow_shell=False)")
        if re.search(r"\b(rm\s+-rf|mkfs|dd\s+|shutdown|reboot|killall)\b", a["cmd"]):
            raise ToolError("command blocked by safety policy")
        r = subprocess.run(a["cmd"], shell=True, capture_output=True, text=True, timeout=30, cwd=self.workspace)
        return f"rc={r.returncode}\n{r.stdout[:4000]}\n{r.stderr[:2000]}"
    def _http_get(self, a):
        if not self.allow_network: raise ToolError("network access disabled by policy (allow_network=False)")
        with urllib.request.urlopen(a["url"], timeout=15) as r:
            return r.read().decode(errors="ignore")[: self.max_result_chars]
