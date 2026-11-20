# Model research (2026) and selection

Researched Nov 2026. All figures are vendor-reported / Ollama Q4 sizes; verify
before pulling. NACE never auto-downloads models.

| Model | Params | Q4 size | RAM | Context | License | Best for |
|---|---|---|---|---|---|---|
| Qwen3.5 0.8B | 0.8B | 1.3 GB | 2 GB | 256K | Apache-2.0 | ultra-low RAM |
| Qwen3.5 2B | 2B | 2.7 GB | 3 GB | 256K | Apache-2.0 | 4 GB machines |
| Qwen3.5 4B | 4B | 3.4 GB | 4 GB | 256K | Apache-2.0 | best overall CPU default |
| Qwen3 4B/8B | 4B/8B | 3.0/5.2 GB | 4/7 GB | 32K | Apache-2.0 | chat+coding, multilingual |
| Gemma 3 4B | 4B | 3.0 GB | 4 GB | 128K | Gemma | multimodal, 140+ langs |
| Phi-4-mini | 3.8B | 2.5 GB | 3.5 GB | 128K | MIT | reasoning/math per GB |
| Llama 3.2 3B | 3B | 2.0 GB | 3 GB | 128K | Llama Community | beginner default |
| SmolLM3 3B | 3B | 1.9 GB | 3 GB | 128K | Apache-2.0 | low RAM open |
| DeepSeek-R1-Distill | 1.5B/7B | 1.1/4.7 GB | 2/6 GB | 128K | MIT | reasoning traces |
| Ministral 3B / Granite 3.2 2B | 3B/2B | ~1.9/1.3 GB | 3/2.5 GB | 128K | Apache-2.0 | edge |

Sources: [1](https://localaimaster.com/blog/small-language-models-guide-2026)
[2](https://www.popularai.org/p/best-cpu-only-local-llm-2026)
[3](https://www.promptquorum.com/local-llms/small-local-llm-models)
[4](https://codersera.com/blog/best-small-llms-to-run-locally-a-comprehensive-guide/)

## Backends (small reliable foundation first)

- **Ollama** (default): `ollama pull qwen3:4b`, HTTP API on :11434.
- **llama.cpp server**: `llama-server -m model.gguf --port 8080`, OpenAI-compat.
- **OpenAI-compatible**: any LM Studio / vLLM / llama.cpp endpoint.
- **Transformers**: lazy import, only if installed; never auto-downloads.
- **Mock**: built-in, zero download, proves orchestration without intelligence.

`nace model list` shows installed + catalog; `nace diagnostics` recommends the
largest fitting model for measured RAM (capped at 60% of available RAM).
One provider may fill all roles (primary/coding/small/memory/embedding/vision)
on low-RAM machines; embeddings fall back to deterministic hashing vectors.
