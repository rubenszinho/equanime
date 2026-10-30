# Equânime Collector

Private service the Equânime API calls to fetch Lattes CVs from CNPq's institutional
extractor (`WSCurriculo.getCurriculoCompactado`). It returns the Lattes XML (zipped,
base64); the API parses it with the same code it uses for uploaded XML.

Why it exists: CNPq answers only IPs it has authorized for an institution
(`Serviço negado.IP:…` otherwise), and Workers have no fixed egress IP. The collector
runs on a server with a fixed IP (oracle-rubrion-1) behind a Cloudflare Tunnel and Access.

It never opens the public CV pages: those sit behind a captcha, and Equânime does not
get around captchas. When no source can read a CV, the API marks the person
`needs_upload` and the user sends the XML they download themselves.

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
EQUANIME_COLLECTOR_AUTH=dev .venv/bin/uvicorn equanime_collector.main:app --app-dir src --port 8090
.venv/bin/pytest
```

| Variable | Meaning |
|---|---|
| `EQUANIME_COLLECTOR_BACKEND` | `fixture` (the repository's `fixtures/curricula.json`) or `cnpq` |
| `EQUANIME_COLLECTOR_TOKEN` | Bearer token the API sends (`COLLECTOR_TOKEN` there) |
| `EQUANIME_COLLECTOR_AUTH` | `dev` skips the token when none is set; anything else requires it |
| `EQUANIME_COLLECTOR_DB` | SQLite job queue; finished jobs are deleted after a day |

Jobs run one at a time in a background thread, so CNPq never gets parallel requests.

Image: `docker build -f equanime-collector/Dockerfile .` from the repository root.
Deploy: `~/rubrion/infra/instances/oracle-rubrion-1/equanime-collector/README.md`.

Before `cnpq` works in production, USP/ICMC must ask CNPq to authorize the server's IP
for the extractor. Until then the API's `COLLECTOR_MODE` can be `upload`.
