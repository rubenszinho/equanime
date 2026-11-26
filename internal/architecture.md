# Architecture

| Part | What | Runs on |
|---|---|---|
| `equanime-api/` | Hono + Zod OpenAPI Worker: analyses, rules, PDF, uploads | Cloudflare, `api.equanime.rubrion.ai` |
| `equanime-web-client/` | Astro + React site, PT-BR; proxies `/api/*` to the API by service binding; the floating assistant (Beholder) at `/api/agent/*` | Cloudflare, `equanime.rubrion.ai` (own accounts, cookie `eq_u`) |
| `equanime-agent/` | The "Análise de Banca" agent (Mastra, Workers AI Gemma): Beholder routes for the web chat (service binding only) and an OpenAI-compatible `/v1` | Cloudflare, `agent.equanime.rubrion.ai` (`/v1` only) |
| `video/` | Playwright + ffmpeg scripts that record the PT-BR demo and presentation videos from the local stack (`video/README.md`) | locally |
| `equanime-collector/` | FastAPI: CNPq's institutional extractor, then CNPq's public search (Playwright), SQLite job queue | cortex.icmc.usp.br (venv + cron, no Docker there; `~/rubrion/infra/instances/cortex-icmc/equanime-collector`), tunnel `equanime-collector.rubrion.ai` (Access service token); oracle-rubrion-1's Docker stack is the stopped fallback |

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
  Not authorized for Rubrion's IPs nor cortex's yet (tested 2026-11-20).
- **CNPq's public search** (`busca`, collector): home page → Busca Textual → the name →
  the result whose CV carries the requested ID. The search's invisible reCAPTCHA gives the
  CV link its token, so no challenge shows on a normal visit (found by the advisor, tested
  2026-11-23). The collector reads the HTML into a Curriculum (`source: public_page`,
  co-authors in citation form, IDs where CNPq links them). A challenge → `captcha_required`
  → upload. A CV URL opened directly shows the reCAPTCHA checkbox; the collector never does that.
- **Upload**: the user downloads the XML from the CV page (passing Lattes' captcha themselves)
  and sends it on the analysis page (`POST /curriculos`, then `reprocessar`).
- A CV no source read is `needs_upload` → reviewer `inconclusive`, never "no conflict".

Parsing of XML (`src/lattes.ts`) happens in the Worker, for the extractor and uploads alike: ISO-8859-1, ZIP, CNPq IDs
on authors and project members (identity by ID first, names as fallback), concluded and
ongoing advising, the person's own degrees and advisors.

## LLM

Optional, only for ambiguous name pairs (`src/llm.ts`), OpenAI-compatible:
`LLM_BASE_URL`, `LLM_MODEL`, secret `LLM_API_KEY`. Rubry's Brad gateway works
(`https://brad-gateway.rubrion.ai/openai/v1/<workspace>`, model `brad`), as would the
Agents4Gov models at ICMC. A failure never fails the rules; calls are logged in `model_calls`.

## The agent

`equanime-agent` holds one agent (`src/agent.ts`) and its tools (`src/tools.ts`:
`criar_analise`, `consultar_analise`, `minhas_analises`, `reprocessar_analise`,
`ler_documento`) that call the API through the
`API` service binding with `Bearer AGENT_KEY` and `X-Equanime-Person`. The API trusts that
header only with the key (`src/auth.ts`), so an analysis started in a chat belongs to the
same person as in the web pages. Who the person is (`src/caller.ts`, AsyncLocalStorage):

| Door | Person |
|---|---|
| Web chat (`/api/agent/*` → gateway → service binding) | the signed-in account's email (`src/lib/session.ts`) |
| `/v1` with `V1_KEY_RUBRY` (rubry.ai) | `rubry:<code>` from `X-Rubry-User` (rubry.ai's Hub: an HMAC per person and agent, never their account id) |
| `/v1` with `V1_KEY_OPENWEBUI` | `openwebui:<email>` when OpenWebUI forwards user headers, else `service:openwebui` |

Attachments in the web chat: a Lattes XML/ZIP goes to `POST /curriculos` (its
`curriculum_ref` feeds an analysis); anything else (an edital, minutes, a list of the
board: PDF, Word, ODT, spreadsheet, CSV, text) goes to `POST /documentos`, and the message
carries `📄 Documento anexado: … document_ref`. `ler_documento` fetches it back as the
person (`GET /documentos/{id}/arquivo`, owner only) and turns it into Markdown with
Workers AI `toMarkdown` (`readFileTool` from `@rubrion/mastra-cloudflare`); the agent
takes the board from it and asks for any Lattes the document lacks. A document never
feeds the conflict rules.

The web chat keeps conversations in D1 `equanime-agent-memory` (Mastra Memory, 50 per
person); `/v1` is stateless (clients send the conversation). The widget is one React island
(`components/Assistant.tsx`): the floating `ChatBox` and the expanded `AssistantScreen`
(`#assistente`) share one `AgentProvider`, so expanding keeps an answer arriving. Its
Tailwind is limited to the kit (`styles/agent.css`); the site's CSS sits in `@layer site`.

The first visit opens a modal with the demo video (`components/Intro.astro`, files in
`public/video/`, recorded by `video/`); "Ver o vídeo" on the home page reopens it.

The brand: a balance whose beam is the circumflex of "Equânime" (`components/Mark.astro`,
the wordmark's â in `layouts/Layout.astro`, `public/favicon.svg`). The assistant is the same
balance in a notary seal (`components/Seal.tsx`, passed as Beholder's `renderMascot`): it
weighs while thinking, turns its edge during a tool call, pulses its pivot while writing.
Rubry's listing uses the seal (`rubry-web/public/logos/equanime.svg`).

## Rubry

A sibling product: own identity and repo, no shared accounts or credit. On rubry.ai it's an
Agent Hub listing (`rubry.ai/agents/equanime`, published from the owner's account) that opens
in the chat with Equânime's key (`V1_KEY_RUBRY`, sealed in the listing): rubry.ai calls `/v1`
with it and `X-Rubry-User`. Not one of rubry-agent's built-in agents any more, so no Rubry
credit is spent on it.

## Accounts and credits

No Cloudflare Access on the site: people register with email, password and a 6-digit email code
(`equanime-api/src/routes/conta.ts`, `src/accounts.ts`, adapted from rubry.ai's). The web Worker
keeps the session token in the HttpOnly cookie `eq_u` and calls the API with `Bearer WEB_KEY` plus
`X-Equanime-Session` (`equanime-web-client/src/lib/session.ts`); the API resolves the session to the
email, which stays the analyses' `actor`. `src/middleware.ts` sends private pages (`/analises*`,
`/conta`, `/admin`) to `/entrar`. Codes come from `no-reply@rubrion.ai` (Email Sending, `EMAIL`);
`OTP_LOG=1` logs them locally. Turnstile guards sign-up and "forgot" once `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET` are set on the web Worker.

Who pays (`payerFor`): emails on `FREE_DOMAINS` (`usp.br`, any subdomain) use it without limit;
integrations (`service:*`, `rubry:*`) too. Any other account spends credits, one per reviewer,
charged atomically when the analysis is created (402 when short) and refunded once if the run ends
`failed`; reprocessing is free. Accounts start at 0; `ADMINS` (a secret) grant credits at `/admin`.
