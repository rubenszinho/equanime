"""Private Lattes collection service for the Equânime API."""
from contextlib import asynccontextmanager
import hmac
import os
import threading

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from equanime_collector import jobs
from equanime_collector.curricula import parse_lattes_id

DB = jobs.connect()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop = threading.Event()
    thread = threading.Thread(target=jobs.worker, args=(stop,), daemon=True)
    thread.start()
    yield
    stop.set()
    jobs.WAKE.set()


app = FastAPI(
    title="Equânime Collector",
    version="0.2.0",
    description="Coleta privada de Currículos Lattes. Uma falha individual não representa ausência de conflito.",
    lifespan=lifespan,
)


class CollectionRequest(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    lattes_url: str = Field(max_length=300)


def authorized(authorization: str | None) -> None:
    expected = os.environ.get("EQUANIME_COLLECTOR_TOKEN", "")
    if os.environ.get("EQUANIME_COLLECTOR_AUTH", "required") == "dev" and not expected:
        return
    if not expected or not hmac.compare_digest((authorization or "").encode(), f"Bearer {expected}".encode()):
        raise HTTPException(status_code=401, detail="Credencial do coletor inválida.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": jobs.backend()}


@app.post("/v1/collections", status_code=202)
def submit(body: CollectionRequest, authorization: str | None = Header(default=None)) -> dict:
    authorized(authorization)
    if not parse_lattes_id(body.lattes_url):
        raise HTTPException(status_code=400, detail="URL Lattes inválida.")
    return {"job_id": jobs.submit(DB, body.name, body.lattes_url), "status": "pending"}


@app.get("/v1/collections/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)) -> dict:
    authorized(authorization)
    record = jobs.get(DB, job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Coleta não encontrada.")
    return record
