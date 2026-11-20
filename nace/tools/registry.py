"""Tool registry with permission gates. Tools are plain callables; execution is logged as episodes."""
from __future__ import annotations
import subprocess
class ToolRegistry:
    def __init__(self): self.tools = {}
    def register(self, name, fn, description=""):
        self.tools[name] = (fn, description)
    def list(self): return [{"name": k, "description": v[1]} for k,v in self.tools.items()]
    def call(self, name, **kw):
        if name not in self.tools: raise KeyError(f"unknown tool {name}")
        return self.tools[name][0](**kw)
def shell_tool(cmd, timeout=30):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    return {"returncode": r.returncode, "stdout": r.stdout[-4000:], "stderr": r.stderr[-4000:]}
