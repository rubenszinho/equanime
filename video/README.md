# Videos

Three PT-BR videos, recorded from the real web client against a local stack (fixture CVs, the
real agent on Workers AI), narrated by a synthetic voice and captioned:

| Version | Segments | Use |
|---|---|---|
| `equanime-demo` (~3 min) | demo + end | The site's first-visit modal (`equanime-web-client/src/components/Intro.astro`) |
| `equanime-apresentacao` (< 1 min) | curta | Presentations: PUB project Agents4Gov (ICMC-USP) → library tool → the Equânime platform, then the product in a few shots |
| `equanime-apresentacao-longa` (~4.5 min) | intro + demo + outro | The full story, with the whole demo |

The narration lines are the `say()` calls in `record.mjs`. `tts.py` voices them with OpenAI
`gpt-4o-mini-tts` (pt-BR instructions and pronunciations in the file; key in Infisical
`Equanime / prod / video / OPENAI_API_KEY`), one cached clip per line, and records how long
each one is spoken; the recorder keeps every line on screen that long, and `build.py` mixes
the clips in at the caption times. `roteiro.pt-BR.md` has the lines with timecodes for a
human narrator.

## Recording

Needs Xvfb, ffmpeg, Node 24 and Playwright (`PLAYWRIGHT_PATH`, default cerne's). Bring up the
local stack (`internal/operations.md`): API, agent and web (`EQUANIME_E2E=1 npx astro dev
--ignore-lock --port 4323`, so the dev toolbar stays hidden). A fresh `DEV_USER` in the web
`.dev.vars` keeps old analyses out; `record.mjs` deletes the chat's old threads itself.

```sh
python3 tts.py <keyFile>         # voice new or changed lines first (timing depends on them)
node record.mjs out/take         # all segments; or: node record.mjs out/take curta
python3 build.py out/take out/final
```

Chromium runs headed on its own X display (`:99`, 1920x1080, CSS viewport 1280x720 at 1.5x)
in an app window, and ffmpeg captures it. Waits for the analysis and the agent are recorded
in real time and sped up in the edit (`fast()`, shown with a `3×`/`4×` badge). The agent's
answer differs between takes; check it before publishing.

## Outputs (`out/final`)

- `equanime-<version>.pt-BR.mp4`: with the voice.
- `equanime-<version>.pt-BR.legendado.mp4`: voice and captions burned in.
- `equanime-<version>.pt-BR.sem-voz.mp4`: silent, for a human narrator.
- `.srt`, `.vtt`, `.ass`: the captions.
- `equanime-demo.web.mp4`, `equanime-demo.poster.jpg`: the site's cut. Copy it to
  `equanime-web-client/public/video/equanime-demo.mp4` / `equanime-demo.jpg`, with the `.vtt`
  as `equanime-demo.pt-BR.vtt`.

`out/` is not committed.
