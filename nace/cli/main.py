"""NACE CLI. All important operations automatable. Exit codes: 0 ok, 1 error."""
from __future__ import annotations
import argparse, json, sys
from nace.core.config import NaceConfig
from nace.core.orchestrator import Orchestrator
from nace.models.registry import CATALOG, recommend
from nace.models.providers import make_provider

def _orch(args):
    cfg = NaceConfig.load(data_dir=args.data_dir)
    if args.model: cfg.model_name = args.model
    if args.backend: cfg.model_backend = args.backend
    if args.context: cfg.context_budget = args.context
    return Orchestrator(cfg)

def _print(obj):
    print(json.dumps(obj, indent=2, default=str))

def main(argv=None):
    p = argparse.ArgumentParser(prog="nace", description="NACE persistent cognitive engine")
    p.add_argument("--data-dir", default="./data")
    p.add_argument("--model", default=""); p.add_argument("--backend", default="")
    p.add_argument("--context", type=int, default=0)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    m = sub.add_parser("memory"); mm = m.add_subparsers(dest="sub", required=True)
    mm.add_parser("list"); s = mm.add_parser("search"); s.add_argument("query")
    i = mm.add_parser("inspect"); i.add_argument("id", type=int)
    t = sub.add_parser("task"); tt = t.add_subparsers(dest="sub", required=True)
    tt.add_parser("list"); c = tt.add_parser("create"); c.add_argument("goal")
    ti = tt.add_parser("inspect"); ti.add_argument("id")
    tr = tt.add_parser("resume"); tr.add_argument("id")
    cx = sub.add_parser("context"); cc = cx.add_subparsers(dest="sub", required=True)
    cc.add_parser("status"); cp = cc.add_parser("checkpoint"); cp.add_argument("task_id", nargs="?")
    sl = sub.add_parser("sleep"); ss = sl.add_subparsers(dest="sub", required=True)
    ss.add_parser("status"); ss.add_parser("history")
    go = ss.add_parser("run"); go.add_argument("--task", default=""); go.add_argument("--reason", default="manual")
    mo = sub.add_parser("model"); mmo = mo.add_subparsers(dest="sub", required=True)
    mmo.add_parser("list"); mmo.add_parser("inspect")
    sub.add_parser("evaluate"); sub.add_parser("diagnostics")
    r = sub.add_parser("run"); r.add_argument("goal"); r.add_argument("--task", default="")
    sub.add_parser("init")
    # Phase 2 additions
    ct = sub.add_parser("cognitive"); ct.add_argument("goal")
    ct.add_argument("--workspace", default="."); ct.add_argument("--task", default="")
    ct.add_argument("--max-iterations", type=int, default=20)
    ct.add_argument("--approve", action="append", default=[])
    ct.add_argument("--allow-shell", action="store_true"); ct.add_argument("--allow-network", action="store_true")
    tl = sub.add_parser("tools"); tll = tl.add_subparsers(dest="sub", required=True)
    tll.add_parser("list"); th = tll.add_parser("history"); th.add_argument("--task", default="")
    sub.add_parser("benchmarks")
    sub.add_parser("recover")
    args = p.parse_args(argv)
    try:
        if args.cmd == "init":
            o = _orch(args); _print({"initialized": True, "db": o.cfg.db_path, "hardware": o.hardware.to_dict()}); o.close(); return
        o = _orch(args)
        try:
            if args.cmd == "status": _print(o.status())
            elif args.cmd == "diagnostics":
                _print({"hardware": o.hardware.to_dict(), "integrity": o.db.integrity_check(),
                        "provider": o.provider.name, "available": o.provider.available(),
                        "models_installed": o.provider.list_models(), "recommended": recommend(o.hardware)})
            elif args.cmd == "memory":
                if args.sub == "list": _print(o.store.list(limit=50))
                elif args.sub == "search": _print(o.retriever.search(args.query, limit=10))
                elif args.sub == "inspect": _print(o.store.get(args.id))
            elif args.cmd == "task":
                if args.sub == "list": _print(o.tm.list())
                elif args.sub == "create": _print({"task_id": o.tm.create(args.goal)})
                elif args.sub == "inspect": _print(o.tm.get(args.id))
                elif args.sub == "resume": _print(o.tm.resume_packet(args.id))
            elif args.cmd == "context":
                if args.sub == "status": _print(o.ctx.status())
                elif args.sub == "checkpoint": _print({"checkpoint_id": o.tm.checkpoint(args.task_id or "", reason="cli")})
            elif args.cmd == "sleep":
                if args.sub == "status": _print({"context_level": o.ctx.level(), "history": o.sleep.history(5)})
                elif args.sub == "history": _print(o.sleep.history(20))
                elif args.sub == "run": _print(o.sleep_now(reason=args.reason, task_id=args.task))
            elif args.cmd == "model":
                if args.sub == "list": _print({"provider": o.provider.name, "installed": o.provider.list_models(), "catalog": CATALOG})
                elif args.sub == "inspect": _print({"provider": o.provider.name, "available": o.provider.available(), "recommended": recommend(o.hardware)})
            elif args.cmd == "evaluate":
                from nace.learning.evaluation import Evaluator
                _print(Evaluator(o.db, o.store, o.tm, o.sleep).run_all())
            elif args.cmd == "run":
                _print(o.run_task(args.goal, task_id=args.task or None))
            elif args.cmd == "cognitive":
                _print(o.run_cognitive_task(args.goal, workspace=args.workspace, task_id=args.task or None,
                      max_iterations=args.max_iterations, approved=args.approve,
                      allow_shell=args.allow_shell, allow_network=args.allow_network))
            elif args.cmd == "tools":
                tools = o.make_tools(workspace=".")
                if args.sub == "list": _print(tools.list())
                elif args.sub == "history": _print(tools.history(task_id=args.task))
            elif args.cmd == "benchmarks":
                from nace.learning.benchmarks import run_all
                _print(run_all())
            elif args.cmd == "recover":
                _print({"recovered_interrupted_sleep_runs": o._recovered_sleep, "integrity": o.db.integrity_check()})
        finally:
            o.close()
    except Exception as e:
        print(f"error: {e}", file=sys.stderr); sys.exit(1)

if __name__ == "__main__":
    main()
