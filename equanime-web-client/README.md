# Equânime web

The PT-BR site at `equanime.rubrion.ai`: landing page, board form, analysis page
(progress, verdicts, evidence, CV uploads, PDF). Astro with React islands on a
Cloudflare Worker; `/api/*` is proxied to `equanime-api` through a service binding,
so the browser never talks to the API across origins.

```bash
cp .dev.vars.example .dev.vars           # points /api at a local equanime-api on :8787
npx astro dev --port 4323 --background   # astro dev logs | stop | status
npm test                                 # component tests
npx playwright test                      # flows with a mocked API
npx astro check && npx astro build
```

Strings live in `src/data/copy.ts`; tokens (light and dark) in `src/styles/global.css`;
app-page styles in `src/styles/app.css`. Verify UI changes at 390px and in dark mode.
