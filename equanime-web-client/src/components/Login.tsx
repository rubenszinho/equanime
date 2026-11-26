import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import { login as copy } from "../data/copy";

type Mode = "signIn" | "register" | "confirm" | "forgot" | "reset";
type Answer = { ok: boolean; status: number; body: { confirmed?: boolean; message?: string | null } };

async function post(path: string, body: unknown, method = "POST"): Promise<Answer> {
	try {
		const reply = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const parsed = (await reply.json().catch(() => ({}))) as Answer["body"];
		return { ok: reply.ok, status: reply.status, body: parsed };
	} catch {
		return { ok: false, status: 0, body: { message: copy.network } };
	}
}

declare global {
	interface Window {
		turnstile?: { render(element: HTMLElement, options: Record<string, unknown>): string; reset(id?: string): void };
	}
}

/** Sign in, create an account, confirm the email by code, or reset the password. */
export default function Login({ back, confirm, siteKey, google = false, failure = "", only = [] }: { back: string; confirm: boolean; siteKey: string; google?: boolean; failure?: string; only?: string[] }) {
	const [mode, setMode] = useState<Mode>(confirm ? "confirm" : "signIn");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState(failure);
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	const [human, setHuman] = useState("");
	const widget = useRef<HTMLDivElement>(null);
	const widgetId = useRef<string | null>(null);

	useEffect(() => setHydrated(true), []);

	// Turnstile, when configured, only where an email goes out (sign-up and forgot).
	const needsHuman = Boolean(siteKey) && (mode === "register" || mode === "forgot");
	useEffect(() => {
		if (!needsHuman || !widget.current) return;
		const draw = () => {
			if (!window.turnstile || !widget.current) return false;
			widget.current.innerHTML = "";
			widgetId.current = window.turnstile.render(widget.current, { sitekey: siteKey, callback: setHuman, "expired-callback": () => setHuman(""), language: "pt-BR" });
			return true;
		};
		if (draw()) return;
		const script = document.createElement("script");
		script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.onload = () => draw();
		document.head.appendChild(script);
	}, [needsHuman, siteKey]);

	const go = (next: Mode) => {
		setMode(next);
		setError("");
		setNote("");
	};
	const done = () => window.location.assign(back);

	async function submit(event: { preventDefault(): void }) {
		event.preventDefault();
		setBusy(true);
		setError("");
		setNote("");
		const access = (body: Record<string, unknown>) => post("/api/conta/acesso", { ...body, turnstile: human });
		let reply: Answer;
		if (mode === "signIn") reply = await access({ action: "login", email, password });
		else if (mode === "register") reply = await access({ action: "register", name, email, password });
		else if (mode === "forgot") reply = await access({ action: "forgot", email });
		else if (mode === "reset") reply = await access({ action: "reset", email, code, password });
		else reply = await post("/api/conta", { action: "verify", code });
		setBusy(false);
		if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
		setHuman("");
		if (!reply.ok) {
			setError(reply.body.message ?? copy.network);
			return;
		}
		if (mode === "forgot") {
			go("reset");
			if (reply.body.message) setError(reply.body.message);
			return;
		}
		if (mode === "register") {
			if (reply.body.message) setNote(reply.body.message);
			setMode("confirm");
			return;
		}
		if (mode === "signIn" && reply.body.confirmed === false) {
			setMode("confirm");
			await post("/api/conta", { action: "resend" });
			return;
		}
		done();
	}

	async function resend() {
		const reply = await post("/api/conta", { action: "resend" });
		if (reply.ok) toast.success(copy.confirm.resent);
		else setError(reply.body.message ?? copy.network);
	}

	async function other() {
		await post("/api/conta", { action: "logout" });
		go("signIn");
	}

	const titles: Record<Mode, string> = { signIn: copy.signIn.title, register: copy.register.title, confirm: copy.confirm.title, forgot: copy.forgot.title, reset: copy.forgot.title };
	const submitLabel: Record<Mode, string> = { signIn: copy.signIn.submit, register: copy.register.submit, confirm: copy.confirm.submit, forgot: copy.forgot.send, reset: copy.forgot.submit };
	const askEmail = mode === "signIn" || mode === "register" || mode === "forgot";
	const askPassword = mode === "signIn" || mode === "register" || mode === "reset";
	const askCode = mode === "confirm" || mode === "reset";

	const tabs = mode === "signIn" || mode === "register";

	return (
		<MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
			<form className="sheet box login" data-hydrated={hydrated ? "true" : "false"} onSubmit={submit}>
				{tabs ? (
					<div className="login__tabs" role="tablist" aria-label={copy.signIn.title}>
						{(["signIn", "register"] as const).map((item) => (
							<button key={item} type="button" role="tab" aria-selected={mode === item} className="login__tab" onClick={() => go(item)}>
								{mode === item ? <motion.span layoutId="login-tab" className="login__pill" /> : null}
								<span className="login__tab-label">{item === "signIn" ? copy.signIn.submit : copy.register.submit}</span>
							</button>
						))}
					</div>
				) : null}
				<Smooth>
					<AnimatePresence mode="wait" initial={false}>
						<motion.div key={tabs ? "tabs" : mode} className="login__step" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
							{/* With the tabs showing, they name the step; the heading stays for screen readers. */}
							<h1 className={tabs ? "visually-hidden" : undefined}>{titles[mode]}</h1>
							{only.length > 0 && tabs ? <p className="login__only">{copy.restricted(only)}</p> : mode === "register" ? <p className="soft">{copy.register.lead}</p> : null}
							{mode === "confirm" ? <p className="soft">{copy.confirm.lead(email)}</p> : null}
							{mode === "forgot" ? <p className="soft">{copy.forgot.lead}</p> : null}
							{google && tabs ? (
								<>
									<a className="btn btn--quiet google" href={`/api/conta/google?volta=${encodeURIComponent(back)}`}>
										<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" /></svg>
										{copy.google}
									</a>
									<p className="soft small login__or">{copy.or}</p>
								</>
							) : null}
							<AnimatePresence initial={false}>
								{mode === "register" ? (
									<motion.label key="name" className="field" style={{ overflow: "hidden" }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
										<span>{copy.name}</span>
										<input name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
									</motion.label>
								) : null}
							</AnimatePresence>
							{askEmail ? (
								<label className="field">
									<span>{copy.email}</span>
									<input name="email" type="email" autoComplete={mode === "register" ? "email" : "username"} required value={email} onChange={(event) => setEmail(event.target.value)} />
								</label>
							) : null}
							{askCode ? (
								<label className="field">
									<span>{mode === "reset" ? copy.forgot.code : copy.code}</span>
									<input name="code" className="login__code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))} />
								</label>
							) : null}
							{askPassword ? (
								<label className="field">
									<span>{mode === "reset" ? copy.forgot.password : copy.password}</span>
									<input name="password" type="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={mode === "signIn" ? undefined : 8} required value={password} onChange={(event) => setPassword(event.target.value)} />
									{mode !== "signIn" ? <small className="soft">{copy.passwordHint}</small> : null}
								</label>
							) : null}
						</motion.div>
					</AnimatePresence>
				</Smooth>
				{needsHuman ? <div ref={widget} className="turnstile" /> : null}
				<AnimatePresence initial={false}>
					{error ? <motion.p key="error" className="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{error}</motion.p> : null}
				</AnimatePresence>
				{note ? <p className="soft" role="status">{note}</p> : null}
				<button type="submit" className="btn btn--primary login__submit" disabled={busy || (needsHuman && !human)} aria-busy={busy}>{busy ? copy.working : submitLabel[mode]}</button>
				<p className="login__links small">
					{mode === "signIn" ? <button type="button" className="link" onClick={() => go("forgot")}>{copy.forgot.link}</button> : null}
					{mode === "forgot" || mode === "reset" ? <button type="button" className="link" onClick={() => go("signIn")}>{copy.forgot.back}</button> : null}
					{mode === "confirm" ? (
						<>
							<button type="button" className="link" onClick={resend}>{copy.confirm.resend}</button>
							<button type="button" className="link" onClick={other}>{copy.confirm.other}</button>
						</>
					) : null}
				</p>
			</form>
		</MotionConfig>
	);
}

/** Eases its own height to its content's, so the card grows and shrinks between steps. */
function Smooth({ children }: { children: ReactNode }) {
	const inner = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number | "auto">("auto");
	useLayoutEffect(() => {
		if (!inner.current) return;
		const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
		observer.observe(inner.current);
		return () => observer.disconnect();
	}, []);
	return (
		<motion.div className="login__smooth" animate={{ height }} style={{ overflow: "hidden" }}>
			<div ref={inner}>{children}</div>
		</motion.div>
	);
}
