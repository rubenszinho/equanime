import os
from threading import Lock
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from equanime_collector.curricula import fixture_curriculum, live_curriculum, parse_lattes_id

app = FastAPI(
    title="Equânime Collector",
    version="0.1.0",
    description="Coleta privada de Currículos Lattes. Uma falha individual não representa ausência de conflito.",
)
JOBS: dict[str, dict] = {}
LOCK = Lock()


class CollectionRequest(BaseModel):
    name: str = Field(min_length=3)
    lattes_url: str


def authorized(authorization: str | None) -> None:
    expected = os.environ.get("EQUANIME_COLLECTOR_TOKEN", "")
    if os.environ.get("EQUANIME_COLLECTOR_AUTH", "required") == "dev" and not expected:
        return
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Credencial do coletor inválida.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": os.environ.get("EQUANIME_COLLECTOR_BACKEND", "fixture")}


@app.post("/v1/collections", status_code=202)
def submit(body: CollectionRequest, authorization: str | None = Header(default=None)) -> dict:
    authorized(authorization)
    if not parse_lattes_id(body.lattes_url):
        raise HTTPException(status_code=400, detail="URL Lattes inválida.")
    backend = os.environ.get("EQUANIME_COLLECTOR_BACKEND", "fixture")
    curriculum = fixture_curriculum(body.name, body.lattes_url) if backend == "fixture" else live_curriculum(body.name, body.lattes_url)
    job_id = uuid4().hex
    record = {"job_id": job_id, "status": "completed" if curriculum.collection_status != "failed" else "failed", "curriculum": curriculum.as_dict()}
    if curriculum.collection_status == "failed":
        record["error"] = {"type": curriculum.error_type, "message": curriculum.error_message}
    with LOCK:
        JOBS[job_id] = record
    return {"job_id": job_id, "status": record["status"]}


@app.get("/v1/collections/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)) -> dict:
    authorized(authorization)
    with LOCK:
        record = JOBS.get(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Coleta não encontrada.")
    return record
