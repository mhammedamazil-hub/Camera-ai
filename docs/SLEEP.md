# Sleep system

Triggers: context pressure (60% prepare / 75% checkpoint / 85% sleep / 95%
emergency, all configurable), task completion, idle, manual (`nace sleep run`),
shutdown (orchestrator checkpoints active tasks on close).

Pipeline (all real, all reported):
1. Preservation — checkpoint + raw episode records (deterministic, durable).
2. Extraction — observations separated from interpretations; unverified stays unverified.
3. Consolidation — events → episodic/semantic/procedural/failure/success memories.
4. Quality review — dedup by content hash, reject <12-char noise and unsupported filler.
5. Relations — simple pairwise links between consecutively created memories.
6. Compression — archive low-importance old actives; source episodes retained.
7. Continuity — resume packet (done/failed/next/avoid/files).
8. Reconstruction — retrieval-based context rebuild, not a full dump.
9. Wake — SLEEPING tasks return to ACTIVE.

Safety: single-transaction checkpoints (never overwrite), idempotent
consolidation (re-running the same events creates no duplicates), failures mark
the run `failed` and preserve source context. `nace sleep history` shows runs.
