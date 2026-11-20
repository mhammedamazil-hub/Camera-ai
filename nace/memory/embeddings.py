"""Lightweight hashing embeddings (no model download). Deterministic TF hashing -> 384-dim."""
from __future__ import annotations
import hashlib, math, re, struct
DIM = 384
def embed(text: str):
    vec = [0.0]*DIM
    tokens = re.findall(r"[a-z0-9_]+", (text or "").lower())
    for t in tokens:
        h = int(hashlib.md5(t.encode()).hexdigest()[:8], 16)
        vec[h % DIM] += 1.0
    norm = math.sqrt(sum(v*v for v in vec)) or 1.0
    return [v/norm for v in vec]
def pack(vec) -> bytes: return struct.pack(f"<{len(vec)}f", *vec)
def unpack(blob: bytes):
    if not blob: return []
    return list(struct.unpack(f"<{len(blob)//4}f", blob))
def cosine(a, b) -> float:
    if not a or not b or len(a)!=len(b): return 0.0
    return sum(x*y for x,y in zip(a,b))
