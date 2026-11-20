import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, filename TEXT NOT NULL,
    file_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    result TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
    job_id TEXT NOT NULL, idx INTEGER NOT NULL, route TEXT NOT NULL,
    cost_usd REAL NOT NULL, status TEXT NOT NULL, markdown TEXT NOT NULL,
    PRIMARY KEY (job_id, idx)
);
CREATE TABLE IF NOT EXISTS ledger (
    job_id TEXT NOT NULL, usd REAL NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cache (
    file_hash TEXT NOT NULL, pipeline_version TEXT NOT NULL, result TEXT NOT NULL,
    PRIMARY KEY (file_hash, pipeline_version)
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def create_job(conn, session_id: str, filename: str, file_hash: str) -> str:
    job_id = uuid.uuid4().hex
    conn.execute(
        "INSERT INTO jobs (id, session_id, filename, file_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (job_id, session_id, filename, file_hash, _now()),
    )
    conn.commit()
    return job_id


def add_page(conn, job_id: str, idx: int, route: str, cost_usd: float, status: str, markdown: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO pages VALUES (?, ?, ?, ?, ?, ?)",
        (job_id, idx, route, cost_usd, status, markdown),
    )
    conn.commit()


def get_cached(conn, file_hash: str, pipeline_version: str) -> dict | None:
    row = conn.execute(
        "SELECT result FROM cache WHERE file_hash = ? AND pipeline_version = ?",
        (file_hash, pipeline_version),
    ).fetchone()
    return json.loads(row["result"]) if row else None


def put_cached(conn, file_hash: str, pipeline_version: str, result: dict) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO cache VALUES (?, ?, ?)",
        (file_hash, pipeline_version, json.dumps(result)),
    )
    conn.commit()


def spend_today(conn) -> float:
    today = datetime.now(timezone.utc).date().isoformat()
    row = conn.execute(
        "SELECT COALESCE(SUM(usd), 0) AS total FROM ledger WHERE substr(created_at, 1, 10) = ?",
        (today,),
    ).fetchone()
    return row["total"]


def add_ledger(conn, job_id: str, usd: float, kind: str) -> None:
    conn.execute("INSERT INTO ledger VALUES (?, ?, ?, ?)", (job_id, usd, kind, _now()))
    conn.commit()


def list_jobs(conn, session_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM jobs WHERE session_id = ? ORDER BY created_at DESC", (session_id,)
    ).fetchall()
    return [dict(r) for r in rows]
