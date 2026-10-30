from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
from urllib.parse import urlparse

LATTES_HOSTS = {"lattes.cnpq.br", "buscatextual.cnpq.br", "wwws.cnpq.br"}
# The repository's shared fixtures; the image copies them next to the package.
FIXTURES = Path(os.environ.get("EQUANIME_FIXTURES", Path(__file__).resolve().parents[3] / "fixtures" / "curricula.json"))


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
    source: str = "fixture"
    warnings: list[dict[str, str]] = field(default_factory=list)
    publications: list[dict] = field(default_factory=list)
    projects: list[dict] = field(default_factory=list)
    advising: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def parse_lattes_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"} or (parsed.hostname or "").lower() not in LATTES_HOSTS:
        return None
    match = re.search(r"[0-9]{16}", parsed.path + "?" + parsed.query)
    return match.group(0) if match else None


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fixture_curriculum(name: str, lattes_url: str) -> Curriculum:
    lattes_id = parse_lattes_id(lattes_url) or ""
    entry = json.loads(FIXTURES.read_text(encoding="utf-8")).get(lattes_id, {})
    base = Curriculum(name, name, lattes_id, lattes_url, now(), "complete")
    for key, value in entry.items():
        setattr(base, key, value)
    return base
