from datetime import datetime, timedelta, timezone

from app import db


def make_conn(tmp_path):
    return db.init_db(tmp_path / "t.db")


def test_cache_roundtrip(tmp_path):
    conn = make_conn(tmp_path)
    db.put_cached(conn, "h1", "v1", {"markdown": "hi"})
    assert db.get_cached(conn, "h1", "v1") == {"markdown": "hi"}
    assert db.get_cached(conn, "h1", "v2") is None


def test_spend_today_sums_ledger_utc(tmp_path):
    conn = make_conn(tmp_path)
    job = db.create_job(conn, "s", "a.pdf", "h")
    db.add_ledger(conn, job, 0.01, "vision")
    db.add_ledger(conn, job, 0.02, "extract")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    conn.execute(
        "INSERT INTO ledger (job_id, usd, kind, created_at) VALUES (?, ?, ?, ?)",
        (job, 5.0, "vision", yesterday),
    )
    conn.commit()
    assert abs(db.spend_today(conn) - 0.03) < 1e-9


def test_history_scoped_to_session(tmp_path):
    conn = make_conn(tmp_path)
    db.create_job(conn, "A", "a.pdf", "h1")
    db.create_job(conn, "B", "b.pdf", "h2")
    assert [j["filename"] for j in db.list_jobs(conn, "A")] == ["a.pdf"]
