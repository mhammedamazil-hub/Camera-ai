# Phase 2 report

## Capability labels
- Real provider HTTP integration (Ollama/llama.cpp/OpenAI-compat): PARTIALLY VERIFIED
  (stub-server tests pass; no real model available in sandbox — registries blocked).
- Real pretrained inference: BLOCKED in sandbox (registry.ollama.com + huggingface.co
  unreachable; only github/pypi allowed). Optional CI workflow pulls llama3.2:1b.
- Tools (file ops, search, python/shell/http gated): VERIFIED (real execution + tests).
- Cognitive loop with budgets/loop-detection: VERIFIED with scripted policy;
  with a real LLM: UNVERIFIED (blocked, same as above).
- Task persistence/resume, sleep idempotence/recovery, context overflow: VERIFIED.
- Memory-driven decisions (failure/success recall before acting): VERIFIED.
- Benchmarks 9/9: VERIFIED (scripted policy; real-LLM benchmark: UNVERIFIED).
- GitHub Actions CI: added (.github/workflows/ci.yml); results pending first push.

## Secret-fact demo (scripts/secret_demo.py)
Taught: codename 'Vrishti-7749', budget 'KLM-42-ZULU' (provenance=user).
Slept, restarted, asked 3 questions: codename + budget recalled correctly from
memory #1. Known limit: keyword retrieval returns closest record even for
unrelated questions (Q3) instead of abstaining — abstention threshold is future work.
