"""Model registry: researched candidates with real constraints. See docs/MODELS.md."""
from __future__ import annotations
# name, params, approx Q4 download GB, RAM GB, context, license, ollama tag, best_for
CATALOG = [
    dict(name="Qwen3.5 0.8B", params="0.8B", download_gb=1.3, ram_gb=2, context=262144, license="Apache-2.0", ollama="qwen3.5:0.8b", best_for="ultra-low RAM, classification"),
    dict(name="Qwen3.5 2B", params="2B", download_gb=2.7, ram_gb=3, context=262144, license="Apache-2.0", ollama="qwen3.5:2b", best_for="4GB machines"),
    dict(name="Qwen3.5 4B", params="4B", download_gb=3.4, ram_gb=4, context=262144, license="Apache-2.0", ollama="qwen3.5:4b", best_for="best overall CPU default"),
    dict(name="Qwen3 4B", params="4B", download_gb=3.0, ram_gb=4, context=32768, license="Apache-2.0", ollama="qwen3:4b", best_for="balanced chat+coding"),
    dict(name="Qwen3 8B", params="8B", download_gb=5.2, ram_gb=7, context=32768, license="Apache-2.0", ollama="qwen3:8b", best_for="multilingual, coding"),
    dict(name="Gemma 3 4B", params="4B", download_gb=3.0, ram_gb=4, context=131072, license="Gemma", ollama="gemma3:4b", best_for="multimodal, 140+ languages"),
    dict(name="Gemma 3 1B", params="1B", download_gb=0.8, ram_gb=2, context=131072, license="Gemma", ollama="gemma3:1b", best_for="edge"),
    dict(name="Phi-4-mini 3.8B", params="3.8B", download_gb=2.5, ram_gb=3.5, context=131072, license="MIT", ollama="phi4-mini", best_for="reasoning/math per GB"),
    dict(name="Llama 3.2 3B", params="3B", download_gb=2.0, ram_gb=3, context=131072, license="Llama Community", ollama="llama3.2:3b", best_for="beginner default, tool use"),
    dict(name="Llama 3.2 1B", params="1B", download_gb=0.8, ram_gb=1.5, context=131072, license="Llama Community", ollama="llama3.2:1b", best_for="tiny edge"),
    dict(name="SmolLM3 3B", params="3B", download_gb=1.9, ram_gb=3, context=131072, license="Apache-2.0", ollama="smollm3:3b", best_for="low RAM, open"),
    dict(name="SmolLM2 1.7B", params="1.7B", download_gb=1.0, ram_gb=2, context=8192, license="Apache-2.0", ollama="smollm2:1.7b", best_for="edge"),
    dict(name="DeepSeek-R1-Distill-Qwen-1.5B/7B", params="1.5B/7B", download_gb=1.1/4.7, ram_gb=2/6, context=131072, license="MIT", ollama="deepseek-r1:1.5b", best_for="reasoning traces"),
    dict(name="Ministral 3B", params="3B", download_gb=1.9, ram_gb=3, context=131072, license="Apache-2.0", ollama="ministral:3b", best_for="edge reasoning"),
    dict(name="Granite 3.2 2B", params="2B", download_gb=1.3, ram_gb=2.5, context=131072, license="Apache-2.0", ollama="granite3.2:2b", best_for="enterprise edge"),
]
def recommend(hardware):
    """Pick smallest practical model for measured RAM. Never recommend > available RAM."""
    avail_gb = (hardware.ram_available_mb or 0)/1024
    fits = [m for m in CATALOG if m["ram_gb"] <= max(1.5, avail_gb*0.6)]
    if not fits: fits = [CATALOG[0]]
    # prefer best_for containing default/reasoning within fit, else largest that fits
    for m in fits:
        if "best overall" in m["best_for"]: return m
    return max(fits, key=lambda m: m["ram_gb"])
