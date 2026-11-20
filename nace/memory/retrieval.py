"""Hybrid retrieval: FTS5 + keyword + embedding cosine + recency/importance ranking. Contextual, not global dump."""
from __future__ import annotations
import re, time
from nace.memory.embeddings import embed, unpack, cosine

class Retriever:
    def __init__(self, store):
        self.store = store; self.db = store.db
    def search(self, query, project=None, types=None, limit=8, include_archived=False):
        q = (query or "").strip()
        candidates = {}
        # 1) FTS
        if q:
            try:
                safe = '"' + q.replace('"','') + '"'
                rows = self.db.query("SELECT m.* FROM memories_fts f JOIN memories m ON m.id=f.rowid WHERE memories_fts MATCH ? AND m.status='ACTIVE' LIMIT 50",(safe,))
                for r in rows: candidates[r["id"]] = (r, 2.0)
            except Exception:
                pass
            # 2) keyword LIKE fallback
            for tok in re.findall(r"[a-z0-9_]+", q.lower()):
                if len(tok) < 3: continue
                rows = self.db.query("SELECT * FROM memories WHERE status='ACTIVE' AND (lower(title) LIKE ? OR lower(content) LIKE ?) LIMIT 50",(f"%{tok}%",f"%{tok}%"))
                for r in rows:
                    if r["id"] in candidates: candidates[r["id"]] = (candidates[r["id"]][0], candidates[r["id"]][1]+1.0)
                    else: candidates[r["id"]] = (r, 1.0)
        # 3) embedding similarity over active set (bounded scan; fine for local scale)
        qv = embed(q) if q else []
        scored = []
        now = time.time()
        for mid,(r,kw) in candidates.items():
            emb_score = cosine(qv, unpack(r["embedding"])) if r.get("embedding") else 0.0
            recency = 1.0/(1.0 + max(0,(now - r["updated_at"]))/86400.0)
            score = kw + 3.0*emb_score + 0.5*r["importance"] + 0.3*recency
            scored.append((score, r))
        # also consider high-importance project memories even without keyword hit
        if project:
            for r in self.store.list(project=project, limit=20):
                if r["id"] not in candidates:
                    scored.append((0.5*r["importance"], r))
        scored.sort(key=lambda x: -x[0])
        out = []
        for score, r in scored[:limit]:
            if types and r["type"] not in types: continue
            if project and r.get("project") and r["project"] != project and score < 1.0: continue
            r = dict(r); r["score"] = round(score,3)
            self.store.touch(r["id"])
            out.append(r)
        return out
    def format_for_context(self, results, max_chars=4000):
        lines = []
        for r in results:
            lines.append(f"[{r['type']} #{r['id']} conf={r['confidence']:.2f}] {r['title']}: {r['content'][:500]}")
        s = "\n".join(lines)
        return s[:max_chars]
