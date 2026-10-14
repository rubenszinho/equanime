# Equânime API

Cloudflare Worker that accepts a board, collects Lattes curricula through a private adapter, applies deterministic conflict rules, and stores a PDF report.

## Local development

Use Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

The default local mode is `AUTH_MODE=dev`, `COLLECTOR_MODE=fixture` and `EXECUTION_MODE=manual`. Start an analysis with `POST /analises`, then run the same pipeline the Workflow invokes. Production uses `EXECUTION_MODE=workflow`.

```bash
npm run typecheck
npm test
```

## Production resources

Create separate staging and production D1 databases, R2 buckets and Workflows, then replace the placeholder IDs in `wrangler.jsonc`. Apply migrations with Wrangler and deploy with `--env staging` or `--env production`. Secrets (`COLLECTOR_TOKEN`, `ACCESS_CLIENT_SECRET`, `LLM_API_KEY`) are set with `wrangler secret put`, never in the config file.

Human access uses Cloudflare Access JWTs. OpenWebUI uses a dedicated Access service token. The assistant instructions live in `openwebui/analise-de-banca.md`. The production checklist is `docs/cortex-validation.md`.

`GET /openapi.json` is the document registered by OpenWebUI.
