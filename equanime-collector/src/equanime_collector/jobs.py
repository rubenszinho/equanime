"""Collection jobs in SQLite, worked one at a time by a background thread.

Jobs survive restarts, and CNPq is never asked for more than one CV at once.
"""
import base64
import json
import os
from pathlib import Path
import sqlite3
import threading
from uuid import uuid4

from equanime_collector.busca import fetch_cv_page
from equanime_collector.cnpq import SourceError, fetch_zip
from equanime_collector.curricula import fixture_curriculum, now, parse_lattes_id
from equanime_collector.lattes_html import PageError, parse_cv_page

DB_PATH = Path(os.environ.get("EQUANIME_COLLECTOR_DB", "jobs.sqlite"))
# Finished jobs are kept a day: long enough for the API to poll, short for personal data.
KEEP_SECONDS = 24 * 3600


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute(
        "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, name TEXT, lattes_url TEXT, status TEXT, result TEXT, created_at TEXT, done_at TEXT)"
    )
    return db


def backend() -> str:
    return os.environ.get("EQUANIME_COLLECTOR_BACKEND", "fixture")


def backends() -> list[str]:
    """Sources tried in order, e.g. "cnpq,busca": the extractor, then CNPq's public search."""
    return [item.strip() for item in backend().split(",") if item.strip()] or ["fixture"]


def submit(db: sqlite3.Connection, name: str, lattes_url: str) -> str:
    job_id = uuid4().hex
    with db:
        db.execute("INSERT INTO jobs VALUES (?, ?, ?, 'pending', NULL, ?, NULL)", (job_id, name, lattes_url, now()))
    WAKE.set()
    return job_id


def get(db: sqlite3.Connection, job_id: str) -> dict | None:
    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return None
    record = {"job_id": row["id"], "status": row["status"]}
    if row["result"]:
        record.update(json.loads(row["result"]))
    return record


def collect(name: str, lattes_url: str) -> tuple[str, dict]:
    lattes_id = parse_lattes_id(lattes_url) or ""
    error = SourceError("not_found", "Nenhuma fonte configurada leu este currículo.")
    for source in backends():
        try:
            return "completed", collect_from(source, name, lattes_url, lattes_id)
        except SourceError as failure:
            error = failure
    return "failed", {"error": {"type": error.type, "message": error.message}}


def collect_from(source: str, name: str, lattes_url: str, lattes_id: str) -> dict:
    if source == "fixture":
        curriculum = fixture_curriculum(name, lattes_url)
        if curriculum.collection_status in {"failed", "needs_upload"}:
            raise SourceError(curriculum.error_type or "not_found", curriculum.error_message or "Currículo indisponível.")
        return {"curriculum": curriculum.as_dict()}
    if source == "cnpq":
        # The API parses the XML with the same code it uses for uploads.
        return {"xml_base64": base64.b64encode(fetch_zip(lattes_id)).decode()}
    if source == "busca":
        html = fetch_cv_page(name, lattes_id)
        try:
            curriculum = parse_cv_page(html, requested_name=name, lattes_url=lattes_url, consulted_at=now())
        except PageError as error:
            raise SourceError("temporary_unavailable", f"A página do currículo não pôde ser lida: {error}") from error
        if curriculum["lattes_id"] != lattes_id:
            raise SourceError("not_found", "A página aberta não é a do currículo pedido.")
        return {"curriculum": curriculum}
    raise SourceError("not_found", f"Fonte desconhecida: {source}.")


def work_once(db: sqlite3.Connection) -> bool:
    row = db.execute("SELECT id, name, lattes_url FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1").fetchone()
    if not row:
        return False
    with db:
        db.execute("UPDATE jobs SET status = 'running' WHERE id = ?", (row["id"],))
    status, result = collect(row["name"], row["lattes_url"])
    with db:
        db.execute("UPDATE jobs SET status = ?, result = ?, done_at = ? WHERE id = ?", (status, json.dumps(result), now(), row["id"]))
        db.execute("DELETE FROM jobs WHERE done_at IS NOT NULL AND julianday('now') - julianday(done_at) > ?", (KEEP_SECONDS / 86400,))
    return True


WAKE = threading.Event()


def worker(stop: threading.Event) -> None:
    db = connect()
    # A job left running by a crash goes back to the queue.
    with db:
        db.execute("UPDATE jobs SET status = 'pending' WHERE status = 'running'")
    while not stop.is_set():
        if not work_once(db):
            WAKE.wait(timeout=5)
            WAKE.clear()
