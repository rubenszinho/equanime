// Records a scripted browser session as a 1920x1080 video: headed Chromium on its own Xvfb
// display (CSS viewport 1280x720 at scale 1.5), captured by ffmpeg x11grab. Scenes call
// `say()` for each narration line and `fast()` around waits that the edit speeds up; the
// cues and fast-forward spans go to <name>.marks.json for build.py.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? "/home/samuel/rubrion/cerne/node_modules/playwright";
const { chromium } = require(PLAYWRIGHT);

const DISPLAY = process.env.REC_DISPLAY ?? ":99";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A line stays on screen while it is spoken (out/voice/durations.json, from tts.py) and
// at least as long as it takes to read.
const VOICE = process.env.VOICE_DIR ?? new URL("../out/voice/", import.meta.url).pathname;
let spoken = {};
try { spoken = JSON.parse(readFileSync(join(VOICE, "durations.json"), "utf-8")); } catch {}
export const minSeconds = (text) => Math.max(2.6, text.length / 15 + 1.0, (spoken[text]?.seconds ?? 0) + 0.35);

// The cursor a viewer sees: Playwright's mouse never moves the X pointer, so the page draws one.
const CURSOR = `
// The site's first-visit video modal would cover every take.
try { localStorage.setItem("equanime-intro-seen", "1"); } catch {}
(() => {
	const install = () => {
		if (document.getElementById("__rec_cursor")) return;
		const c = document.createElement("div");
		c.id = "__rec_cursor";
		c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2.5l15 9.2-6.6 1.3 3.9 7.4-2.9 1.4-3.8-7.5L4 19.3z" fill="#14233a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
		Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-100px,-100px)", transition: "opacity .2s", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.25))" });
		const ring = document.createElement("div");
		ring.id = "__rec_ring";
		Object.assign(ring.style, { position: "fixed", left: "-18px", top: "-18px", width: "36px", height: "36px", borderRadius: "50%", background: "rgba(58,63,174,.28)", zIndex: "2147483646", pointerEvents: "none", transform: "translate(-100px,-100px) scale(0)", transition: "transform .35s ease-out, opacity .35s" });
		document.documentElement.append(ring, c);
		const s = document.createElement("style");
		s.textContent = "html{scrollbar-width:none}::-webkit-scrollbar{display:none}";
		document.documentElement.append(s);
		const pos = window.__rec_pos ?? { x: -100, y: -100 };
		c.style.transform = \`translate(\${pos.x}px,\${pos.y}px)\`;
	};
	window.addEventListener("mousemove", (e) => {
		window.__rec_pos = { x: e.clientX, y: e.clientY };
		try { sessionStorage.setItem("__rec_pos", JSON.stringify(window.__rec_pos)); } catch {}
		const c = document.getElementById("__rec_cursor");
		if (c) c.style.transform = \`translate(\${e.clientX - 3}px,\${e.clientY - 2}px)\`;
	}, true);
	window.addEventListener("mousedown", (e) => {
		const r = document.getElementById("__rec_ring");
		if (!r) return;
		r.style.transition = "none";
		r.style.opacity = "1";
		r.style.transform = \`translate(\${e.clientX}px,\${e.clientY}px) scale(.3)\`;
		requestAnimationFrame(() => { r.style.transition = "transform .45s ease-out, opacity .45s"; r.style.transform = \`translate(\${e.clientX}px,\${e.clientY}px) scale(1.4)\`; r.style.opacity = "0"; });
	}, true);
	try { window.__rec_pos = JSON.parse(sessionStorage.getItem("__rec_pos")) ?? undefined; } catch {}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();
`;

// Opens pages once, headless, so the dev server has compiled them (and Vite has optimized its
// dependencies, which reloads the page) before a take.
export async function warm(urls, ready = async () => {}) {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.addInitScript(() => { try { localStorage.setItem("equanime-intro-seen", "1"); } catch {} });
	for (const url of urls) {
		await page.goto(url);
		await page.waitForLoadState("networkidle").catch(() => {});
		await ready(page, url);
	}
	await browser.close();
}

export async function record(name, outDir, scene, { colorScheme = "light" } = {}) {
	mkdirSync(outDir, { recursive: true });
	const xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "1920x1080x24", "-nolisten", "tcp"], { stdio: "ignore" });
	await sleep(800);
	const profile = mkdtempSync(join(tmpdir(), "rec-profile-"));
	mkdirSync(join(profile, "Default"), { recursive: true });
	writeFileSync(join(profile, "Default", "Preferences"), JSON.stringify({ translate: { enabled: false }, translate_blocked_languages: ["pt", "pt-BR", "en"], intl: { accept_languages: "pt-BR,pt" } }));
	const context = await chromium.launchPersistentContext(profile, {
		headless: false,
		env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "WAYLAND_DISPLAY")), DISPLAY, XDG_SESSION_TYPE: "x11" },
		ignoreDefaultArgs: ["--enable-automation"],
		args: ["--ozone-platform=x11", "--app=data:text/html,<body style='background:%23f2f4f6'>", "--window-position=0,0", "--window-size=1280,720", "--force-device-scale-factor=1.5", "--disable-features=Translate,TranslateUI", "--disable-infobars", "--hide-crash-restore-bubble", "--no-first-run", "--lang=pt-BR", "--autoplay-policy=no-user-gesture-required"],
		viewport: null,
		locale: "pt-BR",
		colorScheme,
		timezoneId: "America/Sao_Paulo",
	});
	const browser = { close: () => context.close() };
	await context.addInitScript(CURSOR);
	const page = context.pages()[0] ?? (await context.newPage());
	await page.setContent(`<body style="margin:0;background:#f2f4f6"></body>`);
	await sleep(1200);

	const file = `${outDir}/${name}.raw.mp4`;
	const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", "30", "-video_size", "1920x1080", "-i", `${DISPLAY}.0`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "inherit", "inherit"] });
	const t0 = Date.now() + 250; // x11grab's start-up latency
	const now = () => (Date.now() - t0) / 1000;

	const cues = [];
	const fasts = [];
	let open = null; // the fast span in progress
	let last = null; // the cue on screen and how long it must stay

	// Seconds of the final edit between two raw times, with the fast spans applied.
	const edited = (a, b) => {
		let out = 0;
		const spans = [...fasts, ...(open ? [{ start: open.start, end: b, speed: open.speed }] : [])];
		let t = a;
		for (const s of spans.filter((s) => s.end > a && s.start < b).sort((x, y) => x.start - y.start)) {
			if (s.start > t) out += s.start - t;
			out += (Math.min(s.end, b) - Math.max(s.start, t)) / s.speed;
			t = Math.min(s.end, b);
		}
		return out + Math.max(0, b - t);
	};
	const settle = async () => {
		if (!last) return;
		while (edited(last.start, now()) < last.min) await sleep(50);
	};

	const api = {
		page,
		context,
		sleep,
		now,
		// A narration line: waits for the previous one to have been readable, then shows this one.
		async say(text, { min } = {}) {
			await settle();
			if (last) last.cue.end = now();
			const cue = { start: now(), end: null, text };
			cues.push(cue);
			last = { cue, start: cue.start, min: min ?? minSeconds(text) };
		},
		// Waits until the line on screen has been readable (before a scene changes under it).
		settle,
		// Ends the current line (silence follows).
		async hush() {
			await settle();
			if (last) last.cue.end = now();
			last = null;
		},
		async fast(speed, fn) {
			open = { start: now(), speed };
			try { await fn(); } finally { fasts.push({ start: open.start, end: now(), speed }); open = null; }
		},
		// Pointer moves the way a hand does: eased, a few hundred milliseconds.
		async moveTo(target, { duration = 650 } = {}) {
			const box = typeof target === "object" && "x" in target ? { x: target.x, y: target.y, width: 0, height: 0 } : await target.boundingBox();
			const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			const from = await page.evaluate(() => window.__rec_pos ?? { x: 640, y: 420 });
			const steps = Math.max(12, Math.round(duration / 16));
			for (let i = 1; i <= steps; i++) {
				const k = i / steps;
				const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
				await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
				await sleep(duration / steps);
			}
		},
		async click(locator, opts = {}) {
			const off = await locator.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < 70 || r.bottom > innerHeight - 70; });
			if (off) await api.scroll(locator, { duration: 700, offset: 220 });
			await api.moveTo(locator, opts);
			await sleep(120);
			await locator.click({ force: true });
			await sleep(250);
		},
		async type(locator, text, { delay = 45 } = {}) {
			await api.click(locator);
			await locator.pressSequentially(text, { delay });
		},
		// Smooth scroll by a distance, or to bring an element near the top.
		async scroll(target, { duration = 1200, offset = 90 } = {}) {
			const y = typeof target === "number"
				? await page.evaluate((d) => window.scrollY + d, target)
				: await target.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
			await page.evaluate(([y, d]) => new Promise((done) => {
				const s = window.scrollY, t0 = performance.now();
				const step = (t) => {
					const k = Math.min(1, (t - t0) / d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
					window.scrollTo(0, s + (y - s) * e);
					k < 1 ? requestAnimationFrame(step) : done();
				};
				requestAnimationFrame(step);
			}), [y, duration]);
			await sleep(150);
		},
	};

	try {
		await scene(api);
		await api.hush();
		await sleep(400);
	} finally {
		ffmpeg.stdin.write("q");
		await new Promise((r) => ffmpeg.on("close", r));
		await browser.close();
		const gone = new Promise((r) => xvfb.on("exit", r));
		xvfb.kill();
		await gone;
		await sleep(300);
	}
	const duration = now();
	writeFileSync(`${outDir}/${name}.marks.json`, JSON.stringify({ name, duration, cues, fasts }, null, "\t"));
	console.log(`${name}: ${duration.toFixed(1)}s raw, ${cues.length} lines, ${fasts.length} fast spans`);
}
