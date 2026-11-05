# Videos

Two PT-BR videos, recorded from the real web client against a local stack (fixture CVs, the
real agent on Workers AI), with the narration as captions:

| Version | Segments | Use |
|---|---|---|
| `equanime-demo` (~3 min) | demo + end | The site's first-visit modal (`equanime-web-client/src/components/Intro.astro`) |
| `equanime-apresentacao` (~4.5 min) | intro + demo + outro | Presentations: Agents4Gov (LABIC, ICMC-USP) → library tool → the Equânime platform |

The narration lines are the `say()` calls in `record.mjs`; `build.py` writes them out as
`.srt`/`.vtt` and as `roteiro.pt-BR.md` with timecodes for whoever records the voice.

## Recording

Needs Xvfb, ffmpeg, Node 24 and Playwright (`PLAYWRIGHT_PATH`, default cerne's). Bring up the
local stack (`internal/operations.md`): API, agent and web (`EQUANIME_E2E=1 npx astro dev
--ignore-lock --port 4323`, so the dev toolbar stays hidden). A fresh `DEV_USER` in the web
`.dev.vars` keeps old analyses out; `record.mjs` deletes the chat's old threads itself.

```sh
node record.mjs out              # all segments; or: node record.mjs out demo end
python3 build.py out out/final   # edit, caption, join
```

Chromium runs headed on its own X display (`:99`, 1920x1080, CSS viewport 1280x720 at 1.5x)
in an app window, and ffmpeg captures it. Waits for the analysis and the agent are recorded
in real time and sped up in the edit (`fast()`, shown with a `3×`/`4×` badge). The agent's
answer differs between takes; check it before publishing.

## Outputs (`out/final`)

- `equanime-<version>.pt-BR.mp4`: clean, for adding the voice.
- `equanime-<version>.pt-BR.legendado.mp4`: captions burned in.
- `.srt`, `.vtt`, `.ass`: the captions.
- `equanime-demo.web.mp4`, `equanime-demo.poster.jpg`: the site's cut. Copy it to
  `equanime-web-client/public/video/equanime-demo.mp4` / `equanime-demo.jpg`, with the `.vtt`
  as `equanime-demo.pt-BR.vtt`.

`out/` is not committed.
