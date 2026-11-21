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

## Phase 2 additions

- **Real tools** (`nace/tools/framework.py`): read/write/edit/list/search files,
  run_python/run_shell/http_get (approval-gated, off by default), all audited in
  `tool_calls`. `nace tools list|history`, `nace cognitive "<goal>"`.
- **Cognitive loop** (`nace/core/cognitive_loop.py`): goal → memory retrieval →
  plan → tool action → observation → evaluate, with iteration/time/retry budgets,
  loop detection, and failure-memory recording. Model-driven via provider
  `chat()` (native tool-calls or JSON protocol).
- **Benchmarks**: `nace benchmarks` — 9/9 pass (memory recall, failure avoidance,
  continuity, sleep integrity, overflow, tool use/permissions, adaptation,
  long-horizon). Scripted-policy provider = deterministic test double, not intelligence.
- **Providers**: Ollama (native tools), llama.cpp, OpenAI-compat, Transformers,
  Mock. Verified against a stub Ollama server in tests. Real-model inference in
  the dev sandbox is BLOCKED (model registries unreachable); CI has an optional
  manual Ollama workflow. See `docs/PHASE2.md`.

## Measured on this machine (dev sandbox)

2 vCPU Xeon, 3.9 GB RAM, no GPU, no Ollama → `low` mode, mock provider.
All 13 unit tests pass; demo produces a real sleep report with checkpoint +
resume packet. On 8–16 GB RAM machines, `nace diagnostics` recommends a
fitting 2–4B model automatically (never above measured RAM).
