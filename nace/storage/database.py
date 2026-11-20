"""SQLite storage: WAL, transactions, migrations, backup, integrity."""
from __future__ import annotations
import os, shutil, sqlite3, time

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS memories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'semantic',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  confidence REAL NOT NULL DEFAULT 0.5,
  importance REAL NOT NULL DEFAULT 0.5,
  source TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  supersedes INTEGER,
  superseded_by INTEGER,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL, updated_at REAL NOT NULL, last_accessed REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY, goal TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'CREATED', plan TEXT NOT NULL DEFAULT '[]',
  completed_steps TEXT NOT NULL DEFAULT '[]', current_step INTEGER NOT NULL DEFAULT 0,
  dependencies TEXT NOT NULL DEFAULT '[]', findings TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]', files_changed TEXT NOT NULL DEFAULT '[]',
  tests TEXT NOT NULL DEFAULT '[]', next_action TEXT NOT NULL DEFAULT '',
  checkpoint TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL, updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints(
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '{}',
  created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sleep_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, reason TEXT NOT NULL DEFAULT '',
  report TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'ok',
  started_at REAL NOT NULL, finished_at REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS relations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'related', created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(type, status);
CREATE INDEX IF NOT EXISTS idx_mem_project ON memories(project, status);
CREATE INDEX IF NOT EXISTS idx_mem_hash ON memories(content_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
"""
try:
    SCHEMA += "CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(title, content, content='memories', content_rowid='id');\n"
    FTS = True
except Exception:
    FTS = False

class Database:
    def __init__(self, path: str):
        self.path = path
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False, timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA synchronous=FULL;")
        self.conn.execute("PRAGMA foreign_keys=ON;")
        self.conn.executescript(SCHEMA)
        self.conn.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version','1')")
        self.conn.commit()
        self._rebuild_fts()
    def _rebuild_fts(self):
        try:
            n = self.conn.execute("SELECT COUNT(*) FROM memories_fts").fetchone()[0]
            m = self.conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
            if n != m:
                self.conn.execute("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')")
                self.conn.commit()
        except Exception:
            pass
    def execute(self, sql, params=()):
        cur = self.conn.execute(sql, params); self.conn.commit(); return cur
    def query(self, sql, params=()):
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]
    def query_one(self, sql, params=()):
        r = self.conn.execute(sql, params).fetchone()
        return dict(r) if r else None
    def transaction(self):
        return self.conn  # caller uses with conn: for atomicity
    def integrity_check(self) -> str:
        return self.conn.execute("PRAGMA integrity_check").fetchone()[0]
    def backup(self, dest=None) -> str:
        dest = dest or (self.path + ".bak-" + time.strftime("%Y%m%d-%H%M%S"))
        shutil.copy2(self.path, dest)
        return dest
    def close(self):
        try: self.conn.close()
        except Exception: pass
