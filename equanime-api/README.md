# Equânime API

Cloudflare Worker (Hono + Zod OpenAPI) that takes a board, reads the Lattes CVs, applies
the three conflict rules and stores a PDF. `GET /openapi.json` is what OpenWebUI imports.

| Route | What |
|---|---|
| `GET /analises` | The caller's own analyses, newest first (20) |
| `POST /analises` | Start an analysis (candidate, reviewers; advisor and title optional) |
| `GET /analises/{id}` | Status, verdicts per reviewer, evidence, limitations, `needs_upload`, `web_url` |
| `GET /analises/{id}/relatorio.pdf` | The report |
| `POST /analises/{id}/reprocessar` | Run again, with uploaded CVs |
| `POST /curriculos` | Upload a Lattes XML (or the ZIP Lattes gives) |
| `POST /documentos` | Upload a document about a board (edital, minutes: PDF, Word, ODT, spreadsheet, CSV, text; 10 MB) for the assistant to read; never feeds the rules |
| `GET /documentos/{id}/arquivo` | That document, for the person who sent it |

Where CVs come from (`COLLECTOR_MODE`): `http` asks equanime-collector (CNPq's institutional
extractor), `upload` relies on users sending the XML, `fixture` uses `../fixtures/curricula.json`.
A CV no source could read is `needs_upload`: its reviewer is inconclusive, never "no conflict".

## Local development

Node 24 (`export PATH=$HOME/.local/share/mise/installs/node/24.16.0/bin:$PATH`).

```bash
npm install
cp .dev.vars.example .dev.vars        # AUTH_MODE=dev, fixtures, inline execution
npx wrangler d1 migrations apply DB --local
npx wrangler dev --port 8787
npm run typecheck && npm test
```

`wrangler.jsonc` is production; tests override it in `vitest.config.ts`, local dev in `.dev.vars`.
Run `npm run cf-typegen` after changing a binding (`worker-configuration.d.ts` is committed).

## Auth

- Web users: Cloudflare Access on `equanime.rubrion.ai`; the web Worker forwards the JWT
  (`POLICY_AUD` lists the accepted AUD tags).
- OpenWebUI: `Authorization: Bearer <OPENWEBUI_KEY>`.
- The assistant (`equanime-agent`): `Bearer <AGENT_KEY>` plus `X-Equanime-Person`, the person it acts for; the header means nothing without the key.
- Each analysis, PDF, upload and document belongs to its caller; others get 404.

Assistant prompt: `openwebui/analise-de-banca.md`. Acceptance with ICMC: `docs/cortex-validation.md`.
