"""Backward-compatible migrations. Never breaks existing DBs."""
from __future__ import annotations
import sqlite3

MIGRATIONS = [
    # provenance: observation|user|retrieved|interpretation|hypothesis|verified
    "ALTER TABLE memories ADD COLUMN provenance TEXT NOT NULL DEFAULT 'observation'",
    "ALTER TABLE memories ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
    """CREATE TABLE IF NOT EXISTS tool_calls(
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL DEFAULT '',
        tool TEXT NOT NULL, args TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'ok',
        result TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS task_steps(
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
        step INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'action',
        detail TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS attempts(
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL DEFAULT '',
        approach TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'unknown',
        detail TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL)""",
    "CREATE INDEX IF NOT EXISTS idx_toolcalls_task ON tool_calls(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, step)",
    "CREATE INDEX IF NOT EXISTS idx_attempts_task ON attempts(task_id)",
]

def migrate(conn: sqlite3.Connection):
    applied = []
    for sql in MIGRATIONS:
        try:
            conn.execute(sql); applied.append(sql[:40])
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e) or "already exists" in str(e):
                continue
            raise
    conn.commit()
    return applied
