import type { MiddlewareHandler } from "hono";
import { mayEnter, sessionUser, touch, type User } from "./accounts";
import { logInfo } from "./log";
import { sha256 } from "./normalize";
import { envString } from "./settings";

// `user` is set when the caller is signed in through the web app (its account).
export type Actor = { id: string; kind: "user" | "service" | "development"; user?: User };

function safeEqual(left: string, right: string): boolean {
	const a = new TextEncoder().encode(left);
	const b = new TextEncoder().encode(right);
	const length = Math.max(a.length, b.length);
	let diff = a.length ^ b.length;
	for (let index = 0; index < length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
	return diff === 0;
}

const OPEN = new Set(["/health", "/ready", "/openapi.json"]);
// Signing in and up: only the web app calls it, with its key and no session yet.
const SIGN_IN = "/conta/acesso";
// An account whose email isn't confirmed yet can only see itself and confirm it.
const UNCONFIRMED = new Set(["/conta", SIGN_IN]);

export const authenticate: MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: { actor: Actor } }> = async (c, next) => {
	// The spec is public so OpenWebUI can import it before it holds a key.
	if (OPEN.has(c.req.path)) {
		await next();
		return;
	}
	const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
	const fromWeb = Boolean(bearer && c.env.WEB_KEY && safeEqual(bearer, c.env.WEB_KEY));
	if (c.req.path === SIGN_IN) {
		if (!fromWeb && envString(c.env, "AUTH_MODE") !== "dev") return c.json({ status: "error", error_type: "unauthorized", message: "Somente a aplicação web entra e cadastra contas." }, 401);
		c.set("actor", { id: "service:web", kind: "service" });
		await next();
		return;
	}
	const actor = fromWeb
		? await fromSession(c.env, c.req.header("x-equanime-session"))
		: await identify(c.env, { bearer, person: c.req.header("x-equanime-person") });
	if (!actor) return c.json({ status: "error", error_type: "unauthorized", message: "Entre na sua conta do Equânime, ou use a chave da integração." }, 401);
	if (actor.user && !actor.user.email_ok && !UNCONFIRMED.has(c.req.path)) {
		return c.json({ status: "error", error_type: "email_unconfirmed", message: "Confirme seu e-mail com o código que enviamos antes de continuar." }, 403);
	}
	c.set("actor", actor);
	// Who asked is kept in D1 for ownership; logs only get a short hash of it.
	logInfo("request_authenticated", { actor: (await sha256(actor.id)).slice(0, 12), kind: actor.kind, path: c.req.path });
	await next();
};

// The web app's visitor: the session token from its cookie, resolved here. The actor is the email,
// as analyses have always been owned.
async function fromSession(env: CloudflareBindings, token: string | undefined): Promise<Actor | null> {
	if (envString(env, "AUTH_MODE") === "dev" && !token) return { id: "development", kind: "development" };
	const user = await sessionUser(env.DB, token);
	// While sign-in is limited to some institutions, sessions from other emails stop working too.
	if (!user || !mayEnter(env, user.email)) return null;
	await touch(env.DB, user.id);
	return { id: user.email, kind: "user", user };
}

// Emails, "rubry:<id>", "openwebui:<email>" or "service:<name>".
const PERSON = /^[a-z0-9][a-z0-9@._:+-]{2,199}$/;

async function identify(env: CloudflareBindings, request: { bearer?: string; person?: string }): Promise<Actor | null> {
	if (envString(env, "AUTH_MODE") === "dev") return { id: "development", kind: "development" };
	// The Equânime agent acts for the person it is talking to; the header counts only with its key.
	if (request.bearer && env.AGENT_KEY && safeEqual(request.bearer, env.AGENT_KEY)) {
		const person = request.person?.trim().toLowerCase() ?? "";
		if (!PERSON.test(person)) return null;
		return { id: person, kind: person.startsWith("service:") ? "service" : "user" };
	}
	// OpenWebUI tool servers send a Bearer key. All its users share this actor.
	if (request.bearer && env.OPENWEBUI_KEY && safeEqual(request.bearer, env.OPENWEBUI_KEY)) return { id: "service:openwebui", kind: "service" };
	return null;
}

// Analyses and uploads belong to whoever created them.
export function owns(actor: Actor, owner: string): boolean {
	return actor.kind === "development" || actor.id === owner;
}
