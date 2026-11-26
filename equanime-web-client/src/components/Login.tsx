import { useEffect, useRef, useState } from "react";
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
export default function Login({ back, confirm, siteKey }: { back: string; confirm: boolean; siteKey: string }) {
	const [mode, setMode] = useState<Mode>(confirm ? "confirm" : "signIn");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [error, setError] = useState("");
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
		if (reply.ok) setNote(copy.confirm.resent);
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

	return (
		<form className="sheet box login" data-hydrated={hydrated ? "true" : "false"} onSubmit={submit}>
			<h1>{titles[mode]}</h1>
			{mode === "register" ? <p className="soft">{copy.register.lead}</p> : null}
			{mode === "confirm" ? <p className="soft">{copy.confirm.lead(email)}</p> : null}
			{mode === "forgot" ? <p className="soft">{copy.forgot.lead}</p> : null}
			{mode === "register" ? (
				<label className="field">
					<span>{copy.name}</span>
					<input name="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
				</label>
			) : null}
			{askEmail ? (
				<label className="field">
					<span>{copy.email}</span>
					<input name="email" type="email" autoComplete={mode === "register" ? "email" : "username"} required value={email} onChange={(event) => setEmail(event.target.value)} />
				</label>
			) : null}
			{askCode ? (
				<label className="field">
					<span>{mode === "reset" ? copy.forgot.code : copy.code}</span>
					<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))} />
				</label>
			) : null}
			{askPassword ? (
				<label className="field">
					<span>{mode === "reset" ? copy.forgot.password : copy.password}</span>
					<input name="password" type="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={mode === "signIn" ? undefined : 8} required value={password} onChange={(event) => setPassword(event.target.value)} />
					{mode !== "signIn" ? <small className="soft">{copy.passwordHint}</small> : null}
				</label>
			) : null}
			{needsHuman ? <div ref={widget} className="turnstile" /> : null}
			{error ? <p className="error" role="alert">{error}</p> : null}
			{note ? <p className="soft" role="status">{note}</p> : null}
			<button type="submit" className="btn btn--primary" disabled={busy || (needsHuman && !human)} aria-busy={busy}>{busy ? copy.working : submitLabel[mode]}</button>
			<p className="login__links small">
				{mode === "signIn" ? (
					<>
						<button type="button" className="link" onClick={() => go("forgot")}>{copy.forgot.link}</button>
						<span>{copy.signIn.switch} <button type="button" className="link" onClick={() => go("register")}>{copy.signIn.switchAction}</button></span>
					</>
				) : null}
				{mode === "register" ? <span>{copy.register.switch} <button type="button" className="link" onClick={() => go("signIn")}>{copy.register.switchAction}</button></span> : null}
				{mode === "forgot" || mode === "reset" ? <button type="button" className="link" onClick={() => go("signIn")}>{copy.forgot.back}</button> : null}
				{mode === "confirm" ? (
					<>
						<button type="button" className="link" onClick={resend}>{copy.confirm.resend}</button>
						<button type="button" className="link" onClick={other}>{copy.confirm.other}</button>
					</>
				) : null}
			</p>
		</form>
	);
}
