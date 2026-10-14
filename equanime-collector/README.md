# Equânime Collector

Private service that collects Lattes curricula for the Equânime API. Cloudflare Workers call it through `COLLECTOR_URL` and `COLLECTOR_TOKEN`; they never run the browser.

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
EQUANIME_COLLECTOR_AUTH=dev uvicorn equanime_collector.main:app --app-dir src --port 8090
```

`EQUANIME_COLLECTOR_BACKEND=fixture` returns deterministic profiles and typed failures. `live` reports an explicit collection failure when browser automation is unavailable, so the API can mark the review inconclusive instead of inventing an absence of conflict.

Real platform access is opt-in: `EQUANIME_LIVE_LATTES=1 pytest -m live_lattes`.
