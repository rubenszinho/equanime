# Conventions

Same owner and habits as rubry-monorepo:

- When a change is done and its checks pass: commit and push to `main` without asking. No AI attribution.
- Ask first for outward-facing infrastructure: DNS, new paid services, creating or deleting resources.
- Secrets never printed; stdin only; copied to Infisical.
- Never solve, fake or route around a captcha challenge. The collector's `busca` source opens CVs the
  way a person does (CNPq's search, whose invisible reCAPTCHA issues the CV link's token); if a
  challenge ever shows, it stops and the person sends the XML. Never open a CV URL directly (it shows
  the checkbox) and never add stealth or solver tooling.
- Answer in the language the owner writes in. The product UI and API texts are PT-BR.
- Strings in `equanime-web-client/src/data/copy.ts`; OpenAPI descriptions are written for an LLM to act on.
- Missing or partial data is never presented as "no conflict".
- Verify UI changes in a real browser at 390px and in dark mode.

## Open items

- Deploy the collector with `EQUANIME_COLLECTOR_BACKEND=cnpq,busca`, then the API with `COLLECTOR_MODE=http`.
  Preferred host cortex.icmc.usp.br (USP IP; needs ICMC's OK to run a container and a cloudflared
  connector there; `busca` tested from it 2026-11-24: 3 CVs in a row, ~15 s each, no challenge;
  a test copy sits in `~/equanime-test` of the ICMC account); fallback oracle-rubrion-1 (tunnel
  `equanime-collector-prod` exists, no connector yet).
- USP/ICMC to request CNPq extractor access for `144.22.250.174` (oracle-rubrion-1) or `143.107.183.253` (cortex.icmc.usp.br);
  `busca` covers until then. Tested 2026-11-20: cortex is not authorized either (`Serviço negado.IP:143.107.183.253`),
  so the USP network alone does not open the extractor. Production runs `COLLECTOR_MODE=upload` until the collector is deployed.
- LLM for ambiguous names: set `LLM_BASE_URL`/`LLM_MODEL` and the `LLM_API_KEY` secret (Brad workspace).
- Register the tool and assistant in cortex's OpenWebUI with the advisor (`equanime-api/docs/cortex-validation.md`).
- Issue #14's deadline (30/09/2026) has passed; report status on the issue.
- Open the site to anonymous visitors (drop Access on the pages) and require login only for the
  assistant and the analyses, so anyone can see what Equânime is. The video modal is already there for them.
- The videos carry a synthetic voice (`video/tts.py`); a human voice-over can replace it (`roteiro.pt-BR.md`). Then an English version.
