"""Model registry v2: verified facts vs estimates, hardware fit with overhead.
Fields: name, provider, params, quant, download_gb, weights_gb, ram_gb (est. incl.
runtime+KV at default ctx), context, license, ollama tag, capabilities, tool_calling,
vision, roles, verified (bool: vendor-published vs estimated)."""
from __future__ import annotations
CATALOG = [
    dict(name="Qwen3.5 0.8B", provider="ollama", params="0.8B", quant="Q4_K_M", download_gb=1.3, weights_gb=0.9, ram_gb=2.0, context=262144, license="Apache-2.0", ollama="qwen3.5:0.8b", capabilities=["chat","classify"], tool_calling=False, vision=False, roles=["small","classify"], verified=False),
    dict(name="Qwen3.5 2B", provider="ollama", params="2B", quant="Q4_K_M", download_gb=2.7, weights_gb=1.9, ram_gb=3.0, context=262144, license="Apache-2.0", ollama="qwen3.5:2b", capabilities=["chat","coding"], tool_calling=True, vision=False, roles=["small","primary"], verified=False),
    dict(name="Qwen3.5 4B", provider="ollama", params="4B", quant="Q4_K_M", download_gb=3.4, weights_gb=2.6, ram_gb=4.0, context=262144, license="Apache-2.0", ollama="qwen3.5:4b", capabilities=["chat","coding","reasoning"], tool_calling=True, vision=True, roles=["primary","planner","coding"], verified=False),
    dict(name="Qwen3 4B", provider="ollama", params="4B", quant="Q4_K_M", download_gb=3.0, weights_gb=2.5, ram_gb=4.0, context=32768, license="Apache-2.0", ollama="qwen3:4b", capabilities=["chat","coding"], tool_calling=True, vision=False, roles=["primary","coding"], verified=False),
    dict(name="Qwen3 8B", provider="ollama", params="8B", quant="Q4_K_M", download_gb=5.2, weights_gb=5.2, ram_gb=7.0, context=32768, license="Apache-2.0", ollama="qwen3:8b", capabilities=["chat","coding","reasoning"], tool_calling=True, vision=False, roles=["primary","planner"], verified=False),
    dict(name="Gemma 3 4B", provider="ollama", params="4B", quant="Q4_K_M", download_gb=3.0, weights_gb=2.6, ram_gb=4.0, context=131072, license="Gemma", ollama="gemma3:4b", capabilities=["chat","vision"], tool_calling=False, vision=True, roles=["primary","vision"], verified=False),
    dict(name="Gemma 3 1B", provider="ollama", params="1B", quant="Q4_K_M", download_gb=0.8, weights_gb=0.8, ram_gb=1.8, context=131072, license="Gemma", ollama="gemma3:1b", capabilities=["chat"], tool_calling=False, vision=False, roles=["small"], verified=False),
    dict(name="Phi-4-mini 3.8B", provider="ollama", params="3.8B", quant="Q4_K_M", download_gb=2.5, weights_gb=2.5, ram_gb=3.5, context=131072, license="MIT", ollama="phi4-mini", capabilities=["reasoning","coding"], tool_calling=False, vision=False, roles=["primary","planner"], verified=False),
    dict(name="Llama 3.2 3B", provider="ollama", params="3B", quant="Q4_K_M", download_gb=2.0, weights_gb=2.0, ram_gb=3.0, context=131072, license="Llama Community", ollama="llama3.2:3b", capabilities=["chat","tool"], tool_calling=True, vision=False, roles=["primary","tool"], verified=False),
    dict(name="Llama 3.2 1B", provider="ollama", params="1B", quant="Q4_K_M", download_gb=0.8, weights_gb=0.8, ram_gb=1.5, context=131072, license="Llama Community", ollama="llama3.2:1b", capabilities=["chat"], tool_calling=False, vision=False, roles=["small"], verified=False),
    dict(name="SmolLM3 3B", provider="ollama", params="3B", quant="Q4_K_M", download_gb=1.9, weights_gb=1.9, ram_gb=3.0, context=131072, license="Apache-2.0", ollama="smollm3:3b", capabilities=["chat","tool"], tool_calling=True, vision=False, roles=["primary","small"], verified=False),
    dict(name="DeepSeek-R1-Distill-Qwen-1.5B", provider="ollama", params="1.5B", quant="Q4_K_M", download_gb=1.1, weights_gb=1.1, ram_gb=2.0, context=131072, license="MIT", ollama="deepseek-r1:1.5b", capabilities=["reasoning"], tool_calling=False, vision=False, roles=["planner"], verified=False),
    dict(name="Ministral 3B", provider="ollama", params="3B", quant="Q4_K_M", download_gb=1.9, weights_gb=1.9, ram_gb=3.0, context=131072, license="Apache-2.0", ollama="ministral:3b", capabilities=["chat","reasoning"], tool_calling=False, vision=False, roles=["primary"], verified=False),
    dict(name="Granite 3.2 2B", provider="ollama", params="2B", quant="Q4_K_M", download_gb=1.3, weights_gb=1.3, ram_gb=2.5, context=131072, license="Apache-2.0", ollama="granite3.2:2b", capabilities=["chat"], tool_calling=False, vision=False, roles=["small","primary"], verified=False),
]

def estimate_ram(model, context_tokens=8192):
    """Weights + runtime overhead (~0.4GB) + KV cache estimate (~0.1GB per 1K ctx per B params, rough).
    Returns (total_gb, breakdown). Estimates, not verified facts."""
    kv = model["params"] and float(model["params"].replace("B","")) * context_tokens/1024 * 0.02
    return round(model["weights_gb"] + 0.4 + kv, 2), {"weights": model["weights_gb"], "overhead": 0.4, "kv_est": round(kv,2)}

def fits_hardware(model, hardware, context_tokens=8192, reserve_fraction=0.35):
    """Fits only if estimated total <= available RAM * (1 - reserve). Reserve covers OS + apps + swap avoidance."""
    avail_gb = (hardware.ram_available_mb or 0)/1024
    total, _ = estimate_ram(model, context_tokens)
    budget = avail_gb * (1 - reserve_fraction)
    return total <= budget, {"estimated_total_gb": total, "budget_gb": round(budget,2), "available_gb": round(avail_gb,2)}

def recommend(hardware, context_tokens=8192):
    fits = [m for m in CATALOG if fits_hardware(m, hardware, context_tokens)[0]]
    if not fits:
        # smallest model with explicit warning
        m = min(CATALOG, key=lambda x: x["ram_gb"])
        m = dict(m); m["warning"] = "No model fits comfortably; expect swapping/slow inference. Use mock or add RAM."
        return m
    for m in fits:
        if "best overall" in str(m.get("capabilities")): return m
    # prefer tool-calling primary that fits, else largest fitting
    tc = [m for m in fits if m.get("tool_calling") and "primary" in m.get("roles", [])]
    if tc: return max(tc, key=lambda m: m["ram_gb"])
    return max(fits, key=lambda m: m["ram_gb"])
