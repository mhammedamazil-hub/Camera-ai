# Testing & evaluation

```bash
python3 -m unittest discover -s tests -v   # 13 tests, stdlib only
nace evaluate                              # resume accuracy, dedup, failure recall
python3 scripts/demo.py                    # narrative end-to-end demo
```

Covered: hardware detection, model recommendation fits RAM, memory CRUD/dedup,
contextual retrieval, conflict supersession (Godot 4.4 → 4.5), task persistence
+ resume packet, full sleep pipeline, idempotent re-sleep, context thresholds,
failure recall, evaluation scenarios, mock run, DB integrity.

Not yet covered (honest gaps): real-LLM context rollover (needs Ollama +
model), sleep-crash injection mid-transaction, constrained-RAM load test,
no-memory vs memory ablation on real tasks. These require hardware/models
beyond the dev sandbox; the harnesses (Evaluator scenarios, checkpoint API)
are in place to add them.
