import base64
import io
from pathlib import Path
import zipfile

import pytest
from fastapi.testclient import TestClient

from equanime_collector import jobs
from equanime_collector.cnpq import SourceError, interpret
from equanime_collector.curricula import parse_lattes_id
from equanime_collector.lattes_html import PageError, parse_cv_page
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
    # The same refusal zipped, as CNPq sent it to cortex.icmc.usp.br (2026-11-20).
    refusal = io.BytesIO()
    with zipfile.ZipFile(refusal, "w") as handle:
        handle.writestr("0000000000000000_ERRO.xml", '<?xml version="1.0" encoding="ISO-8859-1"?><MENSAGEM><ERRO>Serviço negado.IP:143.107.183.253.</ERRO></MENSAGEM>'.encode("iso-8859-1"))
    with pytest.raises(SourceError) as error:
        interpret(soap(base64.b64encode(refusal.getvalue()).decode()))
    assert error.value.type == "not_authorized"
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


CV_PAGE = (Path(__file__).parent / "fixtures" / "cv_page.html").read_text(encoding="utf-8")
ANA = "http://lattes.cnpq.br/1111111111111111"


def test_cv_page_parses_like_the_xml() -> None:
    cv = parse_cv_page(CV_PAGE, requested_name="Ana Lima", lattes_url=ANA, consulted_at="2026-11-23T00:00:00+00:00")
    assert (cv["detected_name"], cv["lattes_id"], cv["lattes_updated_at"]) == ("Ana Pereira Lima", "1111111111111111", "2026-03-05")
    assert cv["aliases"] == ["LIMA, A. P.", "PEREIRA LIMA, ANA"]
    assert cv["source"] == "public_page" and cv["collection_status"] == "complete"
    article, chapter, event = cv["publications"]
    assert article["title"] == "Um estudo de agrupamento" and article["year"] == 2024
    assert article["authors"] == ["LIMA, A. P.", "RAMOS, C. S.", "OLIVEIRA, D."]
    assert article["author_ids"] == ["2222222222222222"]
    assert chapter["source_record"] == "Capítulo de livro 2021 — Um capítulo"
    assert event["source_record"] == "Trabalho em evento 2020 — Um trabalho em evento"
    # Only research projects, as in the XML parser.
    assert [(p["title"], p["period"], p["participants"]) for p in cv["projects"]] == [
        ("Projeto Alfa", "2022–atual", ["Ana Pereira Lima", "Carlos Souza Ramos"])
    ]
    ongoing, concluded = cv["advising"]  # the undergraduate one is not a rule's concern
    assert (ongoing["advisee_name"], ongoing["advisee_id"], ongoing["level"], ongoing["period"], ongoing["ongoing"]) == (
        "Eduarda Costa", "3333333333333333", "doutorado", "2023–atual", True)
    assert (concluded["advisee_name"], concluded["level"], concluded["year"], concluded["institution"]) == (
        "Fábio Melo", "mestrado", 2022, "Universidade de São Paulo")
    doctorate, masters = cv["training"]
    assert (doctorate["level"], doctorate["advisor_name"], doctorate["advisor_id"], doctorate["year"], doctorate["period"]) == (
        "doutorado", "Carlos Souza Ramos", "2222222222222222", 2019, "2015–2019")
    assert (masters["advisor_name"], masters["advisor_id"], masters["institution"]) == ("Beatriz Nunes", None, "Universidade Federal de São Carlos")


def test_a_captcha_page_is_never_read_as_a_cv() -> None:
    with pytest.raises(PageError):
        parse_cv_page('<html><body><div id="divCaptcha"></div></body></html>', requested_name="x", lattes_url=ANA, consulted_at="")


def test_sources_are_tried_in_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EQUANIME_COLLECTOR_BACKEND", "cnpq,busca")
    monkeypatch.setattr(jobs, "fetch_zip", lambda _id: (_ for _ in ()).throw(SourceError("not_authorized", "negado")))
    asked = []
    monkeypatch.setattr(jobs, "fetch_cv_page", lambda name, lattes_id: asked.append((name, lattes_id)) or CV_PAGE)
    done = run(TestClient(app), ANA, name="Ana Lima")
    assert asked == [("Ana Lima", "1111111111111111")]
    assert done["status"] == "completed" and done["curriculum"]["detected_name"] == "Ana Pereira Lima"
    # The search opened someone else's page: never their CV under this person's name.
    other = run(TestClient(app), "http://lattes.cnpq.br/4444444444444444", name="Ana Lima")
    assert other["error"]["type"] == "not_found"
    monkeypatch.setattr(jobs, "fetch_cv_page", lambda *_: (_ for _ in ()).throw(SourceError("captcha_required", "captcha")))
    assert run(TestClient(app), ANA)["error"]["type"] == "captcha_required"


def test_closest_names_are_opened_first() -> None:
    from equanime_collector.busca import by_likeness

    assert by_likeness("Ana Pereira Lima", ["Ana Souza", "Ana Pereira Lima", "Ana Lima Pereira Costa"])[:2] == [1, 2]


@pytest.mark.live_lattes
def test_live_cnpq_search() -> None:
    from equanime_collector.busca import fetch_cv_page

    html = fetch_cv_page("Ricardo Marcondes Marcacini", "3272611282260295")
    cv = parse_cv_page(html, requested_name="Ricardo Marcondes Marcacini", lattes_url="http://lattes.cnpq.br/3272611282260295", consulted_at="")
    assert cv["lattes_id"] == "3272611282260295" and cv["publications"] and cv["advising"]
