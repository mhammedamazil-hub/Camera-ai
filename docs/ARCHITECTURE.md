# Architecture

- `nace/core/hardware.py` — measured CPU/RAM/GPU/disk/runtimes → low/normal/high mode.
- `nace/core/config.py` — structured identity/principles/budgets (not LLM-overwritable).
- `nace/core/orchestrator.py` — wires everything; enforces context thresholds externally.
- `nace/core/task_manager.py` — persistent task state machine + atomic checkpoints.
- `nace/storage/database.py` — SQLite WAL, FULL sync, FTS5, integrity check, backup.
- `nace/memory/` — unified store (episodic/semantic/procedural/project/failure/success),
  working memory, hybrid retrieval (FTS + keyword + hashing-embedding cosine + recency).
- `nace/sleep/engine.py` — 9-stage pipeline; stage 1 is deterministic preservation.
- `nace/context/` — token approximation (labelled inexact), priority sections, emergency protocol.
- `nace/models/` — providers + researched catalog + role selector.
- `nace/learning/` — failure/success learners + measurable evaluation scenarios.
- `nace/cli/main.py` — `nace status|memory|task|context|sleep|model|evaluate|diagnostics|run|init`.

Memory lifecycle: ACTIVE → SUPERSEDED/INVALIDATED/ARCHIVED (history preserved,
never silently deleted). Retrieval is contextual (project + type filters), never
a full-database dump.
