# Equânime Collector

Private service the Equânime API calls to fetch Lattes CVs. Sources, tried in the order
`EQUANIME_COLLECTOR_BACKEND` lists them:

- `cnpq`: CNPq's institutional extractor (`WSCurriculo.getCurriculoCompactado`). Returns
  the Lattes XML (zipped, base64); the API parses it like an uploaded XML. CNPq answers
  only IPs it authorized for an institution (`Serviço negado.IP:…`, which arrives zipped
  as `<id>_ERRO.xml`), and Workers have no fixed egress IP.
- `busca`: CNPq's public search, the way a person uses it (`busca.py`): the home page,
  Busca Textual, the name typed, each result opened until the CV's ID is the one asked
  for (closest names first, at most `EQUANIME_BUSCA_MAX_RESULTS`). The search's invisible
  reCAPTCHA scores the session and gives the CV link its token; no challenge appears on a
  normal visit. If one does, the source stops with `captcha_required`: Equânime never
  solves or fakes a captcha. `lattes_html.py` reads the page into the API's Curriculum
  (`source: public_page`); co-authors come in citation form, with Lattes IDs where CNPq
  links them. Opening a CV URL directly shows the reCAPTCHA checkbox: never do that.
- `fixture`: the repository's `fixtures/curricula.json`.

When no source reads a CV, the API marks the person `needs_upload` and the user sends
the XML they download themselves.

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
EQUANIME_COLLECTOR_AUTH=dev .venv/bin/uvicorn equanime_collector.main:app --app-dir src --port 8090
.venv/bin/playwright install chromium
.venv/bin/pytest                    # offline
.venv/bin/pytest -m live_lattes     # opens one real CV through CNPq's search
```

| Variable | Meaning |
|---|---|
| `EQUANIME_COLLECTOR_BACKEND` | Sources in order, comma-separated: `fixture`, `cnpq`, `busca` (production: `cnpq,busca`) |
| `EQUANIME_BUSCA_MAX_RESULTS` | Same-name results `busca` opens before giving up (5) |
| `EQUANIME_BUSCA_ATTEMPTS` | Fresh sessions `busca` tries when CNPq's server fails to render the results ("Stale file handle" in place of the list), before `temporary_unavailable` (3) |
| `EQUANIME_COLLECTOR_TOKEN` | Bearer token the API sends (`COLLECTOR_TOKEN` there) |
| `EQUANIME_COLLECTOR_AUTH` | `dev` skips the token when none is set; anything else requires it |
| `EQUANIME_COLLECTOR_DB` | SQLite job queue; finished jobs are deleted after a day |

Jobs run one at a time in a background thread, so CNPq never gets parallel requests; `busca`
also pauses between steps and uses a fresh browser per CV.

Image: `docker build -f equanime-collector/Dockerfile .` from the repository root.
Deploy: `~/rubrion/infra/instances/oracle-rubrion-1/equanime-collector/README.md`.

Before `cnpq` works in production, USP/ICMC must ask CNPq to authorize the server's IP
for the extractor; `busca` works without it. Preferred host: cortex.icmc.usp.br (a
university IP scores better with reCAPTCHA than a datacenter one), with ICMC's consent;
fallback oracle-rubrion-1.
