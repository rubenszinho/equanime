# Architecture

| Part | What | Runs on |
|---|---|---|
| `equanime-api/` | Hono + Zod OpenAPI Worker: analyses, rules, PDF, uploads | Cloudflare, `api.equanime.rubrion.ai` |
| `equanime-web-client/` | Astro + React site, PT-BR; proxies `/api/*` to the API by service binding | Cloudflare, `equanime.rubrion.ai` (behind Access) |
| `equanime-collector/` | FastAPI: CNPq's institutional Lattes extractor, SQLite job queue | Docker on oracle-rubrion-1, tunnel `equanime-collector.rubrion.ai` (Access service token) |

## An analysis

1. `POST /analises` (web user through the proxy, or OpenWebUI with the Bearer key) stores the
   board in D1 and starts the `AnalysisWorkflow` (`src/workflow.ts`).
2. `src/pipeline.ts` runs named steps: per participant, use an uploaded XML if there is one,
   else submit to the collector and poll with `step.sleep`; each step stores the CV snapshot
   in R2 itself and returns a flag (step outputs are size-capped).
3. `analyze-and-report`: `src/rules.ts` applies coauthorship, recent advising (academic only)
   and joint research projects; `src/pdf.ts` renders the report (Public Sans embedded).
4. The status and `assistant_summary` are what OpenWebUI repeats to the user.

## Where CVs come from

- **CNPq institutional extractor** (`WSCurriculo.getCurriculoCompactado`), through the collector.
  CNPq answers only IPs it authorized for an institution (`Serviço negado.IP:…`), and Workers
  have no fixed egress IP: that is the only reason the collector exists.
- **Upload**: the user downloads the XML from the CV page (passing Lattes' captcha themselves)
  and sends it on the analysis page (`POST /curriculos`, then `reprocessar`).
- The public CV pages are captcha-gated; Equânime never automates them.
- A CV no source read is `needs_upload` → reviewer `inconclusive`, never "no conflict".

Parsing (`src/lattes.ts`) happens in the Worker for both sources: ISO-8859-1, ZIP, CNPq IDs
on authors and project members (identity by ID first, names as fallback), concluded and
ongoing advising, the person's own degrees and advisors.

## LLM

Optional, only for ambiguous name pairs (`src/llm.ts`), OpenAI-compatible:
`LLM_BASE_URL`, `LLM_MODEL`, secret `LLM_API_KEY`. Rubry's Brad gateway works
(`https://brad-gateway.rubrion.ai/openai/v1/<workspace>`, model `brad`), as would the
Agents4Gov models at ICMC. A failure never fails the rules; calls are logged in `model_calls`.

## Rubry

A sibling product: own identity and repo, no shared accounts or credit. Listed in the
Rubry Hub as a community agent once the repo is public.
