// Accounts, called only by the web app (it holds WEB_KEY and keeps the session token in a cookie).
// Not in the OpenAPI document: integrations act for people through their own keys.
//   POST /conta/acesso { action: "register", name, email, password }  create, sign in, email a code
//   POST /conta/acesso { action: "login", email, password }            sign in
//   POST /conta/acesso { action: "forgot", email }                     email a code to set a new password
//   POST /conta/acesso { action: "reset", email, code, password }      set it, confirm the email, sign out elsewhere, sign in
//   POST /conta { action: "verify", code } / { action: "resend" } / { action: "logout" }
//   GET /conta                                                         the account, its plan and credits
//   DELETE /conta { password }                                         the account and everything it made
//   GET /admin/usuarios, POST /admin/creditos { email, credits, note }  ADMINS only
import { Hono } from "hono";
import type { Actor } from "../auth";
import {
	balance, checkPassword, cooling, createUser, endSession, forget, freeDomain, googleUser, grant, hashPassword, history, isAdmin, NO_PASSWORD,
	MIN_PASSWORD, newCode, normalEmail, startSession, take, useCode, userByEmail, validEmail, type User,
} from "../accounts";
import { emailCode } from "../mail";
import { purgeActor } from "../retention";
import { logInfo } from "../log";

type AppEnv = { Bindings: CloudflareBindings; Variables: { actor: Actor } };
type Body = { action?: string; name?: string; email?: string; password?: string; code?: string; credits?: number; note?: string };

// Per day: codes per account, codes and sign-ups per network, failed sign-ins per email.
const SENDS = 5;
const NET_SENDS = 20;
const NET_SIGNUPS = 10;
const FAILS = 10;

const fail = (error_type: string, message: string) => ({ status: "error" as const, error_type, message });

export const accountRoutes = new Hono<AppEnv>();

async function view(env: CloudflareBindings, user: User) {
	const institution = freeDomain(env, user.email);
	return {
		email: user.email,
		name: user.name,
		confirmed: Boolean(user.email_ok),
		created: user.created,
		institution,
		unlimited: Boolean(institution),
		credits: institution ? null : await balance(env.DB, user.id),
		admin: isAdmin(env, user.email),
		has_password: (await env.DB.prepare("SELECT pass FROM users WHERE id = ?").bind(user.id).first<{ pass: string }>())?.pass !== NO_PASSWORD,
		retention_days: Number(env.RETENTION_DAYS || "90"),
		history: institution ? [] : await history(env.DB, user.id),
	};
}

async function sendCode(env: CloudflareBindings, user: { id: string; email: string }, kind: "email" | "reset", net: string): Promise<string | null> {
	const wait = await cooling(env.DB, user.id, kind);
	if (wait > 0) return `Aguarde ${wait} s para pedir outro código.`;
	if ((await take(env.DB, `u:${user.id}`, `send:${kind}`, SENDS)) < 0) return "Limite diário de códigos atingido. Tente amanhã.";
	if ((await take(env.DB, net, "send", NET_SENDS)) < 0) return "Muitos códigos pedidos desta rede hoje. Tente amanhã.";
	const code = await newCode(env, user.id, kind);
	if (!(await emailCode(env, user.email, code, kind))) return "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
	return null;
}

accountRoutes.post("/conta/acesso", async (c) => {
	const body = ((await c.req.json().catch(() => null)) ?? {}) as Body;
	// The web app passes a hash of the visitor's network; limits count per network, never per IP.
	const net = `n:${(c.req.header("x-equanime-net") ?? "local").slice(0, 64)}`;
	const email = normalEmail(body.email);
	const password = String(body.password ?? "");
	switch (body.action) {
		case "register": {
			const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
			if (name.length < 2) return c.json(fail("name", "Informe seu nome."), 400);
			if (!validEmail(email)) return c.json(fail("email", "Informe um e-mail válido."), 400);
			if (password.length < MIN_PASSWORD || password.length > 200) return c.json(fail("password", `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`), 400);
			if ((await take(c.env.DB, net, "signup", NET_SIGNUPS)) < 0) return c.json(fail("slow", "Muitos cadastros desta rede hoje. Tente amanhã."), 429);
			const id = await createUser(c.env.DB, { email, name, password });
			if (!id) return c.json(fail("taken", "Já existe uma conta com este e-mail. Entre, ou use \"Esqueci a senha\"."), 409);
			logInfo("account_created", { free: Boolean(freeDomain(c.env, email)) });
			const token = await startSession(c.env.DB, id);
			const problem = await sendCode(c.env, { id, email }, "email", net);
			return c.json({ token, confirmed: false, message: problem }, 201);
		}
		case "login": {
			if ((await take(c.env.DB, `e:${email}`, "fail", FAILS)) < 0) return c.json(fail("locked", "Muitas tentativas. Use \"Esqueci a senha\" ou tente amanhã."), 429);
			const user = await userByEmail(c.env.DB, email);
			if (!user || !(await checkPassword(password, user.pass))) return c.json(fail("login", "E-mail ou senha incorretos."), 401);
			await forget(c.env.DB, `e:${email}`, "fail");
			return c.json({ token: await startSession(c.env.DB, user.id), confirmed: Boolean(user.email_ok) });
		}
		case "forgot": {
			// Same answer whether or not the email has an account.
			const user = validEmail(email) ? await userByEmail(c.env.DB, email) : null;
			const problem = user ? await sendCode(c.env, user, "reset", net) : null;
			return c.json({ ok: true, message: problem });
		}
		case "reset": {
			const user = await userByEmail(c.env.DB, email);
			if (password.length < MIN_PASSWORD || password.length > 200) return c.json(fail("password", `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`), 400);
			if (!user || !(await useCode(c.env, user.id, "reset", String(body.code ?? "").trim()))) return c.json(fail("code", "Código incorreto ou expirado."), 400);
			// The code reached the mailbox: that also confirms the email.
			await c.env.DB.batch([
				c.env.DB.prepare("UPDATE users SET pass = ?, email_ok = COALESCE(email_ok, ?) WHERE id = ?").bind(await hashPassword(password), new Date().toISOString(), user.id),
				c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
			]);
			await forget(c.env.DB, `e:${email}`, "fail");
			return c.json({ token: await startSession(c.env.DB, user.id), confirmed: true });
		}
		case "google": {
			// The web Worker checked Google's ID token (verified email, our client); only it holds WEB_KEY.
			if (!validEmail(email)) return c.json(fail("email", "O Google não informou um e-mail válido."), 400);
			const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
			const id = await googleUser(c.env.DB, email, name);
			await forget(c.env.DB, `e:${email}`, "fail");
			return c.json({ token: await startSession(c.env.DB, id), confirmed: true });
		}
		default:
			return c.json(fail("action", "Ação desconhecida."), 400);
	}
});

accountRoutes.get("/conta", async (c) => {
	const user = c.get("actor").user;
	if (!user) return c.json(fail("no_account", "Esta credencial não é de uma conta."), 404);
	return c.json(await view(c.env, user));
});

accountRoutes.post("/conta", async (c) => {
	const user = c.get("actor").user;
	if (!user) return c.json(fail("no_account", "Esta credencial não é de uma conta."), 404);
	const body = ((await c.req.json().catch(() => null)) ?? {}) as Body;
	const net = `n:${(c.req.header("x-equanime-net") ?? "local").slice(0, 64)}`;
	switch (body.action) {
		case "verify": {
			if (user.email_ok) return c.json({ confirmed: true });
			if (!(await useCode(c.env, user.id, "email", String(body.code ?? "").trim()))) return c.json(fail("code", "Código incorreto ou expirado."), 400);
			await c.env.DB.prepare("UPDATE users SET email_ok = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
			return c.json({ confirmed: true });
		}
		case "resend": {
			if (user.email_ok) return c.json({ confirmed: true });
			const problem = await sendCode(c.env, user, "email", net);
			return problem ? c.json(fail("send", problem), 429) : c.json({ ok: true });
		}
		case "logout": {
			await endSession(c.env.DB, c.req.header("x-equanime-session") ?? "");
			return c.json({ ok: true });
		}
		default:
			return c.json(fail("action", "Ação desconhecida."), 400);
	}
});

accountRoutes.delete("/conta", async (c) => {
	const user = c.get("actor").user;
	if (!user) return c.json(fail("no_account", "Esta credencial não é de uma conta."), 404);
	const body = ((await c.req.json().catch(() => null)) ?? {}) as Body;
	const stored = await userByEmail(c.env.DB, user.email);
	// Accounts that only use Google confirm by typing APAGAR instead of a password.
	const confirmed = stored?.pass === NO_PASSWORD ? String(body.password ?? "").trim().toUpperCase() === "APAGAR" : stored && (await checkPassword(String(body.password ?? ""), stored.pass));
	if (!stored || !confirmed) return c.json(fail("login", stored?.pass === NO_PASSWORD ? "Digite APAGAR para confirmar." : "Senha incorreta."), 401);
	await purgeActor(c.env, user.email);
	// The ledger stays, for the record of credits granted and spent.
	await c.env.DB.batch([
		c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
		c.env.DB.prepare("DELETE FROM codes WHERE user_id = ?").bind(user.id),
		c.env.DB.prepare("DELETE FROM wallets WHERE user_id = ?").bind(user.id),
		c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
	]);
	logInfo("account_deleted", {});
	return c.json({ ok: true });
});

function admin(actor: Actor, env: CloudflareBindings): boolean {
	return Boolean(actor.user?.email_ok && isAdmin(env, actor.user.email));
}

accountRoutes.get("/admin/usuarios", async (c) => {
	if (!admin(c.get("actor"), c.env)) return c.json(fail("forbidden", "Somente administradores."), 403);
	const { results } = await c.env.DB
		.prepare("SELECT u.email, u.name, u.email_ok IS NOT NULL AS confirmed, u.created, u.last_seen, COALESCE(w.n, 0) AS credits, (SELECT COUNT(*) FROM analyses a WHERE a.actor = u.email) AS analyses FROM users u LEFT JOIN wallets w ON w.user_id = u.id ORDER BY u.created DESC LIMIT 500")
		.all<{ email: string; name: string; confirmed: number; created: string; last_seen: string | null; credits: number; analyses: number }>();
	return c.json({ users: results.map((row) => ({ ...row, confirmed: Boolean(row.confirmed), institution: freeDomain(c.env, row.email) })) });
});

accountRoutes.post("/admin/creditos", async (c) => {
	if (!admin(c.get("actor"), c.env)) return c.json(fail("forbidden", "Somente administradores."), 403);
	const body = ((await c.req.json().catch(() => null)) ?? {}) as Body;
	const credits = Number(body.credits);
	if (!Number.isInteger(credits) || credits === 0 || Math.abs(credits) > 10_000) return c.json(fail("credits", "Informe um número inteiro de créditos (negativo para retirar)."), 400);
	const user = await userByEmail(c.env.DB, normalEmail(body.email));
	if (!user) return c.json(fail("not_found", "Nenhuma conta com este e-mail."), 404);
	if (credits < 0 && (await balance(c.env.DB, user.id)) + credits < 0) return c.json(fail("credits", "A conta não tem tantos créditos para retirar."), 400);
	await grant(c.env.DB, user.id, credits, String(body.note ?? "").trim().slice(0, 200) || null);
	logInfo("credits_granted", { credits });
	return c.json({ email: user.email, credits: await balance(c.env.DB, user.id) });
});
