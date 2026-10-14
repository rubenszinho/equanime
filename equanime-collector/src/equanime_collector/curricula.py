from dataclasses import dataclass, field
from datetime import datetime, timezone
import re


@dataclass
class Curriculum:
    requested_name: str
    detected_name: str | None
    lattes_id: str
    lattes_url: str
    consulted_at: str | None
    collection_status: str
    error_type: str | None = None
    error_message: str | None = None
    warnings: list[dict[str, str]] = field(default_factory=list)
    publications: list[dict] = field(default_factory=list)
    projects: list[dict] = field(default_factory=list)
    advising: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__


def parse_lattes_id(url: str) -> str | None:
    if "cnpq.br" not in url:
        return None
    match = re.search(r"[0-9]{16}", url)
    return match.group(0) if match else None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fixture_curriculum(name: str, lattes_url: str) -> Curriculum:
    lattes_id = parse_lattes_id(lattes_url) or ""
    base = Curriculum(
        requested_name=name,
        detected_name=name,
        lattes_id=lattes_id,
        lattes_url=lattes_url,
        consulted_at=now(),
        collection_status="complete",
    )
    if lattes_id == "0000000000000000":
        base.detected_name = None
        base.collection_status = "failed"
        base.error_type = "temporary_unavailable"
        base.error_message = "Indisponibilidade temporária da Plataforma Lattes."
        return base
    if lattes_id == "7777777777777777":
        base.collection_status = "partial"
        base.warnings.append({"code": "partial_curriculum", "message": "Currículo parcialmente recuperado."})
        return base
    if lattes_id == "1111111111111111":
        base.publications.append({
            "title": "Métodos de Inteligência Artificial para políticas públicas",
            "year": 2024,
            "authors": ["João da Silva", "Carlos Pereira"],
            "source_record": "Publicação 2024 — Métodos de Inteligência Artificial para políticas públicas",
        })
    return base


def live_curriculum(name: str, lattes_url: str) -> Curriculum:
    lattes_id = parse_lattes_id(lattes_url)
    if not lattes_id:
        return Curriculum(name, None, "", lattes_url, now(), "failed", "invalid_url", "URL Lattes inválida.")
    try:
        import browser_use  # noqa: F401
    except Exception:
        return Curriculum(
            name,
            None,
            lattes_id,
            lattes_url,
            now(),
            "failed",
            "missing_dependency",
            "O coletor ao vivo não está disponível neste ambiente. A análise não deve presumir ausência de conflito.",
        )
    return Curriculum(
        name,
        None,
        lattes_id,
        lattes_url,
        now(),
        "failed",
        "temporary_unavailable",
        "A coleta ao vivo exige uma sessão autenticada do navegador e não foi concluída.",
    )
