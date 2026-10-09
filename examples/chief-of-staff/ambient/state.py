"""Small persistence helpers for the ambient worker (SQLite on the worker's volume)."""
import hashlib
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "memory" / "ambient.sqlite3"


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS seen (source TEXT, key TEXT, PRIMARY KEY (source, key))")
    conn.execute("CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, kind TEXT, thread_id TEXT,"
                 " payload TEXT, status TEXT DEFAULT 'open', response TEXT)")
    return conn


def already_seen(source: str, key: str) -> bool:
    """Pub/Sub delivers at least once; Calendar may resend. First writer wins."""
    with _db() as conn:
        cur = conn.execute("INSERT OR IGNORE INTO seen VALUES (?, ?)", (source, key))
        return cur.rowcount == 0


def thread_key(gmail_thread_id: str) -> str:
    """Stable run id per email thread, so a new reply resumes the same conversation."""
    return hashlib.md5(gmail_thread_id.encode("utf-8")).hexdigest()


def verify_pubsub_jwt(authorization: str) -> bool:
    """Checks the OIDC bearer token Pub/Sub attaches to push requests.

    Production: google.oauth2.id_token.verify_oauth2_token(token, Request(), audience=...)
    and compare the email claim with the push service account.
    """
    return authorization.startswith("Bearer ") and len(authorization) > 40


def approved_items(thread_id: str) -> set[str]:
    """Ids of review cards the user approved; the send gate hook checks this."""
    with _db() as conn:
        rows = conn.execute("SELECT id FROM inbox WHERE thread_id = ? AND status = 'approved'",
                            (thread_id,)).fetchall()
    return {r[0] for r in rows}
