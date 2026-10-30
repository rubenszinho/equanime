# Conventions

Same owner and habits as rubry-monorepo:

- When a change is done and its checks pass: commit and push to `main` without asking. No AI attribution.
- Ask first for outward-facing infrastructure: DNS, new paid services, creating or deleting resources.
- Secrets never printed; stdin only; copied to Infisical.
- Never bypass a captcha. The Lattes CV pages are captcha-gated: humans download the XML.
- Answer in the language the owner writes in. The product UI and API texts are PT-BR.
- Strings in `equanime-web-client/src/data/copy.ts`; OpenAPI descriptions are written for an LLM to act on.
- Missing or partial data is never presented as "no conflict".
- Verify UI changes in a real browser at 390px and in dark mode.

## Open items

- Deploy the collector on oracle-rubrion-1 (tunnel `equanime-collector-prod` exists, no connector yet).
- USP/ICMC to request CNPq extractor access for `144.22.250.174`; production runs `COLLECTOR_MODE=upload` until then.
- LLM for ambiguous names: set `LLM_BASE_URL`/`LLM_MODEL` and the `LLM_API_KEY` secret (Brad workspace).
- Register the tool and assistant in cortex's OpenWebUI with the advisor (`equanime-api/docs/cortex-validation.md`).
- Issue #14's deadline (30/09/2026) has passed; report status on the issue.
- Rubry Hub listing once the repo is public.
