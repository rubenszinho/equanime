# Operations

## Toolchain

- Node 24 from mise: `export PATH=$HOME/.local/share/mise/installs/node/24.16.0/bin:$PATH` (system Node 18 breaks Wrangler 4).
- `export CLOUDFLARE_ACCOUNT_ID=1da13e1445adbf8765ae19ae46ba7ac8` (Rubrion).
- Pinned: web `typescript@5.9.3`, `vitest@3.2.x` (newer majors break `astro check`). Keep `compatibility_date` 2026-10-14.
- Workerd: write `[0-9]`, not `\d`.
- Binding types: `npm run cf-typegen` (API) / `npx wrangler types` (web) with `.dev.vars` moved aside, else local vars leak into the committed file and CI's drift check fails.

## Local dev

```sh
cd equanime-api && cp .dev.vars.example .dev.vars && npx wrangler d1 migrations apply DB --local && npx wrangler dev --port 8787
cd equanime-web-client && cp .dev.vars.example .dev.vars && npx astro dev --port 4323 --background
cd equanime-collector && EQUANIME_COLLECTOR_AUTH=dev .venv/bin/uvicorn equanime_collector.main:app --app-dir src --port 8090
```

- `astro dev` backgrounds itself when it detects an agent; Playwright uses `--ignore-lock` to stay in the foreground.
- To exercise the HTTP collector locally: API `.dev.vars` `COLLECTOR_MODE=http`, `COLLECTOR_TOKEN=<t>`, and the collector with `EQUANIME_COLLECTOR_TOKEN=<t>`.
- Browser checks: Playwright at `~/rubrion/cerne/node_modules/playwright`, 390px and dark mode.

## Checks

API `npm run typecheck && npm test`; collector `.venv/bin/pytest`; web `npm test && npx playwright test && npx astro check && npx astro build`. CI: `.github/workflows/equanime.yml`.

## Deploy

Order: equanime-api (`npx wrangler d1 migrations apply DB --remote`, then `npx wrangler deploy`), then equanime-web-client (`npm run deploy`). Collector: `~/rubrion/infra/instances/oracle-rubrion-1/equanime-collector/README.md`.

## Secrets

Never printed; through stdin (`printf '%s' "$V" | npx wrangler secret put NAME`); also in Infisical (`rubry` project, folder `/equanime`).

| Where | Secrets |
|---|---|
| equanime-api | `OPENWEBUI_KEY`, `COLLECTOR_TOKEN`, `COLLECTOR_ACCESS_SECRET`, `LLM_API_KEY` |
| collector `.env` | `EQUANIME_COLLECTOR_TOKEN` (= `COLLECTOR_TOKEN`), `TUNNEL_TOKEN` |

## After a deploy

`curl https://api.equanime.rubrion.ai/health` → 200; then `docs/cortex-validation.md`.
