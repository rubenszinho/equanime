import os

import pytest
from fastapi.testclient import TestClient

from equanime_collector.curricula import parse_lattes_id
from equanime_collector.main import app


@pytest.fixture(autouse=True)
def auth(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EQUANIME_COLLECTOR_AUTH", "dev")
    monkeypatch.setenv("EQUANIME_COLLECTOR_BACKEND", "fixture")


def test_parse_lattes_id() -> None:
    assert parse_lattes_id("http://lattes.cnpq.br/1111111111111111") == "1111111111111111"
    assert parse_lattes_id("https://example.com/1111111111111111") is None


def test_fixture_collection_and_typed_failure() -> None:
    client = TestClient(app)
    created = client.post("/v1/collections", json={"name": "João da Silva", "lattes_url": "http://lattes.cnpq.br/1111111111111111"})
    assert created.status_code == 202
    job = client.get(f"/v1/collections/{created.json()['job_id']}")
    assert job.json()["curriculum"]["publications"][0]["year"] == 2024
    failed = client.post("/v1/collections", json={"name": "Sem Acesso", "lattes_url": "http://lattes.cnpq.br/0000000000000000"})
    body = client.get(f"/v1/collections/{failed.json()['job_id']}").json()
    assert body["status"] == "failed"
    assert body["error"]["type"] == "temporary_unavailable"
    assert body["curriculum"]["collection_status"] == "failed"


def test_invalid_url_and_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    assert client.post("/v1/collections", json={"name": "João da Silva", "lattes_url": "https://example.com"}).status_code == 400
    monkeypatch.setenv("EQUANIME_COLLECTOR_AUTH", "required")
    monkeypatch.setenv("EQUANIME_COLLECTOR_TOKEN", "secret")
    assert client.get("/health").status_code == 200
    denied = client.post("/v1/collections", json={"name": "João da Silva", "lattes_url": "http://lattes.cnpq.br/1111111111111111"})
    assert denied.status_code == 401


@pytest.mark.live_lattes
def test_live_collection_is_explicitly_gated() -> None:
    if os.environ.get("EQUANIME_LIVE_LATTES") != "1":
        pytest.skip("Coleta real desativada")
    assert os.environ["LATTES_URL"]
