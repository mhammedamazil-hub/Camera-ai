# NACE — Neurogenesis Artificial Cognitive Engine

Persistent AI cognitive architecture: pretrained local LLM (reasoning engine) +
persistent memory, autonomous sleep/consolidation, context management, task
continuity. The model provides intelligence; NACE provides continuity; memory
provides persistence; sleep provides consolidation; evaluation determines
whether learning actually happened.

**Honest boundaries:** NACE does not train the foundation model, does not claim
consciousness, and does not treat summaries as perfect memory. Memory-based
learning (levels 1–5) is implemented; model adaptation (level 6: LoRA etc.)
is intentionally deferred until a real dataset + baseline exist.

## Quick start (stdlib only, no downloads)

```bash
python3 -m unittest discover -s tests -v   # 13 tests
python3 scripts/demo.py                     # end-to-end: task -> failure -> sleep -> resume
nace --data-dir ./data init
nace --data-dir ./data status
nace --data-dir ./data task create "My project goal"
nace --data-dir ./data run "Research runtime architecture"
nace --data-dir ./data sleep run --reason manual
nace --data-dir ./data memory search "physics collision"
nace --data-dir ./data evaluate
```

Without a local LLM, NACE runs on a clearly-labelled **mock provider** so the
memory/sleep/task machinery is fully testable. For real intelligence:

```bash
ollama pull qwen3:4b        # or phi4-mini / gemma3:4b / llama3.2:3b (see docs/MODELS.md)
nace --data-dir ./data --backend ollama --model qwen3:4b run "Your task"
```

## Architecture

```
NACE Orchestrator (context enforcement lives here, not in the LLM)
 ├─ Model providers: Ollama | llama.cpp | OpenAI-compat | Transformers | Mock
 ├─ Memory (SQLite WAL + FTS5 + hashing embeddings): working / episodic /
 │  semantic / procedural / project / failure / success, with
 │  ACTIVE/SUPERSEDED/INVALIDATED/ARCHIVED lifecycle
 ├─ Sleep engine (9 stages): preserve -> extract -> consolidate -> quality
 │  review -> relations -> compress -> continuity -> reconstruct -> wake
 ├─ Context manager: budget, priority sections, 60/75/85/95% thresholds,
 │  emergency protocol (checkpoint -> consolidate -> resume packet -> new session)
 └─ Tasks: CREATED/PLANNED/ACTIVE/PAUSED/SLEEPING/BLOCKED/COMPLETED/FAILED
```

See `docs/ARCHITECTURE.md`, `docs/MODELS.md`, `docs/SLEEP.md`, `docs/TESTING.md`.

## Measured on this machine (dev sandbox)

2 vCPU Xeon, 3.9 GB RAM, no GPU, no Ollama → `low` mode, mock provider.
All 13 unit tests pass; demo produces a real sleep report with checkpoint +
resume packet. On 8–16 GB RAM machines, `nace diagnostics` recommends a
fitting 2–4B model automatically (never above measured RAM).
