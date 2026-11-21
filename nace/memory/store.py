"""Unified memory store: episodic/semantic/procedural/project layers over SQLite."""
from __future__ import annotations
import hashlib, time
from nace.memory.embeddings import embed, pack, unpack, cosine
from nace.storage.database import Database

TYPES = ("working","episodic","semantic","procedural","project","failure","success")
STATUSES = ("ACTIVE","SUPERSEDED","INVALIDATED","ARCHIVED")

def content_hash(content: str) -> str:
    return hashlib.sha256((content or "").strip().lower().encode()).hexdigest()

class MemoryStore:
    def __init__(self, db: Database):
        self.db = db
    def add(self, type="semantic", title="", content="", project="", tags="",
            confidence=0.5, importance=0.5, source="", status="ACTIVE", supersedes=None,
            provenance="observation", version=1) -> int:
        assert type in TYPES, f"bad type {type}"
        now = time.time()
        h = content_hash(title + "\n" + content)
        cur = self.db.execute(
            "INSERT INTO memories(type,title,content,project,tags,status,confidence,importance,source,content_hash,embedding,supersedes,created_at,updated_at,last_accessed,provenance,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (type,title,content,project,tags,status,confidence,importance,source,h,pack(embed(title+" "+content)),supersedes,now,now,now,provenance,version))
        mid = cur.lastrowid
        try:
            self.db.execute("INSERT INTO memories_fts(rowid,title,content) VALUES(?,?,?)",(mid,title,content))
        except Exception: pass
        if supersedes:
            self.db.execute("UPDATE memories SET status='SUPERSEDED', superseded_by=?, updated_at=? WHERE id=?",(mid,now,supersedes))
            self.db.execute("UPDATE memories SET supersedes=? WHERE id=?",(supersedes,mid))
        return mid
    def get(self, mid):
        r = self.db.query_one("SELECT * FROM memories WHERE id=?",(mid,))
        if r and r.get("embedding"): r["embedding_vec"] = unpack(r["embedding"])
        return r
    def list(self, type=None, project=None, status="ACTIVE", limit=50):
        q, p = "SELECT * FROM memories WHERE 1=1", []
        if type: q += " AND type=?"; p.append(type)
        if project: q += " AND project=?"; p.append(project)
        if status: q += " AND status=?"; p.append(status)
        q += " ORDER BY importance DESC, updated_at DESC LIMIT ?"; p.append(limit)
        return self.db.query(q, tuple(p))
    def update_status(self, mid, status):
        assert status in STATUSES
        self.db.execute("UPDATE memories SET status=?, updated_at=? WHERE id=?",(status,time.time(),mid))
    def touch(self, mid):
        self.db.execute("UPDATE memories SET access_count=access_count+1, last_accessed=? WHERE id=?",(time.time(),mid))
    def find_duplicate(self, title, content):
        h = content_hash(title + "\n" + content)
        return self.db.query_one("SELECT * FROM memories WHERE content_hash=? AND status='ACTIVE' ORDER BY id DESC LIMIT 1",(h,))
    def counts(self):
        return {r["type"]: r["n"] for r in self.db.query("SELECT type, COUNT(*) n FROM memories WHERE status='ACTIVE' GROUP BY type")}
    def add_relation(self, from_id, to_id, kind="related"):
        self.db.execute("INSERT INTO relations(from_id,to_id,kind,created_at) VALUES(?,?,?,?)",(from_id,to_id,kind,time.time()))
    def relations(self, mid):
        return self.db.query("SELECT * FROM relations WHERE from_id=? OR to_id=?",(mid,mid))
