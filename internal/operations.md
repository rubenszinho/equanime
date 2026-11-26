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
- UI kit: shadcn/ui (Radix) in `equanime-web-client/src/components/ui`, on the site's tokens (`src/styles/ui.css`), plus `motion` for transitions. Add one with `npx shadcn@latest add <name>`, then check its imports use `@/lib/utils` (the CLI once wired an npm package called `cn`) and drop `next-themes` (the theme is `<html data-theme>`). Layer order is in `global.css`: shadcn's reset, the site, overrides, utilities.

## Checks

API `npm run typecheck && npm test`; collector `.venv/bin/pytest`; web `npm test && npx playwright test && npx astro check && npx astro build`. CI: `.github/workflows/equanime.yml`.

## Deploy

Order: equanime-api (`npx wrangler d1 migrations apply DB --remote`, then `npx wrangler deploy`), then equanime-web-client (`npm run deploy`). Collector: `~/rubrion/infra/instances/cortex-icmc/equanime-collector/README.md`.

## Cloudflare resources (created 2026-10-30)

| What | Name / id |
|---|---|
| D1 | `equanime` (`cdb6fe43-ed73-474a-9469-7af6366f04b6`, enam) |
| R2 | `equanime-evidence` |
| Workflow | `equanime-analysis` (created by the API deploy) |
| Workers | `equanime-api` on `api.equanime.rubrion.ai` (no Access; Bearer keys, or `WEB_KEY` + session from the web Worker), `equanime-web-client` on `equanime.rubrion.ai`, `equanime-agent` on `agent.equanime.rubrion.ai` (`/v1` with a key; the chat routes only by service binding) |
| D1 (agent) | `equanime-agent-memory` (`d1b0234f-6f0e-4fd6-94ac-70a742744c07`, enam): the web chat's conversations |
| Access app "Equânime" | deleted 2026-11-26: the site is public and people sign in with Equânime accounts. The IdP "Google — Equânime" stays unused; its OAuth client now backs "Entrar com Google" |
| Access app "Equânime collector" | `equanime-collector.rubrion.ai`, service token `equanime-api` only (expires 2027-10-30) |
| Tunnel | `equanime-collector-prod` (`10126536-499d-4e20-90e7-61912b3f6145`), remotely managed, ingress → `http://collector:8090`, proxied CNAME |

## Secrets

Never printed; through stdin (`printf '%s' "$V" | npx wrangler secret put NAME`); also in Infisical (project `Equanime`, slug `equanime-ji3-a`, env `prod`, folder `/equanime-api`: `OPENWEBUI_KEY`, `COLLECTOR_TOKEN`; folder `/equanime-collector`: the collector VM's `.env` values; `COLLECTOR_ACCESS_SECRET` lives only in the Worker, rotate the service token to get a copy).

| Where | Secrets |
|---|---|
| equanime-api | `WEB_KEY` (also on equanime-web-client), `ADMINS` (emails that grant credits), `OPENWEBUI_KEY`, `COLLECTOR_TOKEN`, `COLLECTOR_ACCESS_SECRET` (set straight from the token creation; only in the Worker, rotate the service token to copy it), `LLM_API_KEY` (not set yet) |
| equanime-web-client | `WEB_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (same values as Infisical `/cloudflare-access-google`), `TURNSTILE_SECRET` (optional, with the `TURNSTILE_SITE_KEY` var) |
| collector `.env` | `EQUANIME_COLLECTOR_TOKEN` (= `COLLECTOR_TOKEN`), `TUNNEL_TOKEN` |
| equanime-agent | `AGENT_KEY` (also on equanime-api), `V1_KEY_RUBRY` (the key sealed in rubry.ai's Hub listing `equanime`; rotated 2026-11-12, not yet in Infisical: the old copy at `rubry` `/rubry-agent/EQUANIME_API_KEY` is stale. Rotating again: set it here and save it in the listing's Edit form, same value), `V1_KEY_OPENWEBUI`; Infisical `/equanime-agent` |

## cortex.icmc.usp.br

ICMC's server (Agents4Gov's OpenWebUI, a Playwright MCP on port 35010, and Equânime's collector:
`~/rubrion/infra/instances/cortex-icmc/equanime-collector/README.md`). SSH needs the USP VPN:
`sudo openfortivpn orion.uspnet.usp.br:31443 -u <Número USP>` (senha única) in a terminal of its own, then
`ssh -i ~/.ssh/cortex_icmc <account ICMC gave>@cortex.icmc.usp.br`. Egress IPv4 `143.107.183.253`.
**The VPN intercepts TLS** (Fortinet re-signs every HTTPS site): with it on, use only SSH; log in to
Infisical, Cloudflare or deploy with Wrangler only with it off.

## After a deploy

`curl https://api.equanime.rubrion.ai/health` → 200; then `docs/cortex-validation.md`.
