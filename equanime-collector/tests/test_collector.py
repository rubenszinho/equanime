import base64
import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from equanime_collector import jobs
from equanime_collector.cnpq import SourceError, interpret
from equanime_collector.curricula import parse_lattes_id
from equanime_collector.main import DB, app


@pytest.fixture(autouse=True)
def dev(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EQUANIME_COLLECTOR_AUTH", "dev")
    monkeypatch.delenv("EQUANIME_COLLECTOR_TOKEN", raising=False)
    monkeypatch.setenv("EQUANIME_COLLECTOR_BACKEND", "fixture")


def run(client: TestClient, lattes_url: str, name: str = "João da Silva") -> dict:
    created = client.post("/v1/collections", json={"name": name, "lattes_url": lattes_url})
    assert created.status_code == 202
    while jobs.work_once(DB):
        pass
    return client.get(f"/v1/collections/{created.json()['job_id']}").json()


def test_parse_lattes_id() -> None:
    assert parse_lattes_id("http://lattes.cnpq.br/1111111111111111") == "1111111111111111"
    assert parse_lattes_id("https://example.com/1111111111111111") is None
    assert parse_lattes_id("https://evilcnpq.br/1111111111111111") is None
    assert parse_lattes_id("http://lattes.cnpq.br/perfil") is None


def test_fixture_jobs_share_the_api_fixtures() -> None:
    client = TestClient(app)
    done = run(client, "http://lattes.cnpq.br/1111111111111111")
    assert done["status"] == "completed"
    assert done["curriculum"]["publications"][0]["year"] == 2024
    assert done["curriculum"]["projects"][0]["participants"] == ["João da Silva", "Ana Santos"]
    failed = run(client, "http://lattes.cnpq.br/0000000000000000")
    assert failed["status"] == "failed"
    assert failed["error"]["type"] == "temporary_unavailable"
    captcha = run(client, "http://lattes.cnpq.br/9999999999999999")
    assert captcha["error"]["type"] == "captcha_required"


def test_invalid_url_and_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    assert client.post("/v1/collections", json={"name": "João da Silva", "lattes_url": "https://example.com"}).status_code == 400
    monkeypatch.setenv("EQUANIME_COLLECTOR_AUTH", "required")
    monkeypatch.setenv("EQUANIME_COLLECTOR_TOKEN", "secret")
    assert client.get("/health").status_code == 200
    body = {"name": "João da Silva", "lattes_url": "http://lattes.cnpq.br/1111111111111111"}
    assert client.post("/v1/collections", json=body).status_code == 401
    assert client.post("/v1/collections", json=body, headers={"authorization": "Bearer nope"}).status_code == 401
    assert client.post("/v1/collections", json=body, headers={"authorization": "Bearer secret"}).status_code == 202


def soap(value: str) -> str:
    return f"<env:Envelope><env:Body><ws:getCurriculoCompactadoResponse><return>{value}</return></ws:getCurriculoCompactadoResponse></env:Body></env:Envelope>"


def test_cnpq_answers() -> None:
    # What CNPq sends an IP it has not authorized (recorded 2026-10-30).
    denied = soap("&lt;?xml version=&quot;1.0&quot; encoding=&quot;ISO-8859-1&quot;?&gt;&lt;MENSAGEM&gt;&lt;ERRO&gt;Serviço negado.IP:189.7.87.28.&lt;/ERRO&gt;&lt;/MENSAGEM&gt;")
    with pytest.raises(SourceError) as error:
        interpret(denied)
    assert error.value.type == "not_authorized"
    with pytest.raises(SourceError) as error:
        interpret(soap(""))
    assert error.value.type == "not_found"
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as handle:
        handle.writestr("1111111111111111.xml", "<CURRICULO-VITAE/>")
    assert interpret(soap(base64.b64encode(archive.getvalue()).decode())) == archive.getvalue()


def test_cnpq_backend_returns_the_archive(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EQUANIME_COLLECTOR_BACKEND", "cnpq")
    monkeypatch.setattr(jobs, "fetch_zip", lambda lattes_id: b"PK zip for " + lattes_id.encode())
    done = run(TestClient(app), "http://lattes.cnpq.br/1111111111111111")
    assert base64.b64decode(done["xml_base64"]) == b"PK zip for 1111111111111111"
    monkeypatch.setattr(jobs, "fetch_zip", lambda _id: (_ for _ in ()).throw(SourceError("not_authorized", "negado")))
    assert run(TestClient(app), "http://lattes.cnpq.br/1111111111111111")["error"]["type"] == "not_authorized"
