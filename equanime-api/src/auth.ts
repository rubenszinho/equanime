import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { logInfo } from "./log";
import { sha256 } from "./normalize";
import { envString } from "./settings";

export type Actor = { id: string; kind: "user" | "service" | "development" };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function safeEqual(left: string, right: string): boolean {
	const a = new TextEncoder().encode(left);
	const b = new TextEncoder().encode(right);
	const length = Math.max(a.length, b.length);
	let diff = a.length ^ b.length;
	for (let index = 0; index < length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
	return diff === 0;
}

const OPEN = new Set(["/health", "/ready", "/openapi.json"]);

export const authenticate: MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: { actor: Actor } }> = async (c, next) => {
	// The spec is public so OpenWebUI can import it before it holds a key.
	if (OPEN.has(c.req.path)) {
		await next();
		return;
	}
	const actor = await identify(c.env, {
		jwt: c.req.header("cf-access-jwt-assertion"),
		bearer: c.req.header("authorization")?.replace(/^Bearer\s+/i, ""),
		clientId: c.req.header("cf-access-client-id") ?? "",
		clientSecret: c.req.header("cf-access-client-secret") ?? "",
	});
	if (!actor) return c.json({ status: "error", error_type: "unauthorized", message: "Autenticação obrigatória: Cloudflare Access ou a chave da integração." }, 401);
	c.set("actor", actor);
	// Who asked is kept in D1 for ownership; logs only get a short hash of it.
	logInfo("request_authenticated", { actor: (await sha256(actor.id)).slice(0, 12), kind: actor.kind, path: c.req.path });
	await next();
};

async function identify(env: CloudflareBindings, request: { jwt?: string; bearer?: string; clientId: string; clientSecret: string }): Promise<Actor | null> {
	if (envString(env, "AUTH_MODE") === "dev") return { id: "development", kind: "development" };
	// OpenWebUI tool servers send a Bearer key, not Access headers. All its users share this actor.
	if (request.bearer && env.OPENWEBUI_KEY && safeEqual(request.bearer, env.OPENWEBUI_KEY)) return { id: "service:openwebui", kind: "service" };
	const teamDomain = envString(env, "TEAM_DOMAIN").replace(/\/$/, "");
	// One AUD per Access application: the web app forwards its user's JWT, the API host has its own.
	const audiences = envString(env, "POLICY_AUD").split(",").map((item) => item.trim()).filter(Boolean);
	if (request.jwt && teamDomain && audiences.length > 0) {
		try {
			jwks ??= createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
			const { payload } = await jwtVerify(request.jwt, jwks, { issuer: teamDomain, audience: audiences });
			const claims = payload as Record<string, unknown>;
			if (typeof claims.email === "string") return { id: claims.email.toLowerCase(), kind: "user" };
			// Service tokens carry common_name (the client ID) instead of an email.
			if (typeof claims.common_name === "string") return { id: `service:${claims.common_name}`, kind: "service" };
			return null;
		} catch {
			return null;
		}
	}
	const configuredId = envString(env, "ACCESS_CLIENT_ID");
	if (configuredId && env.ACCESS_CLIENT_SECRET && safeEqual(request.clientId, configuredId) && safeEqual(request.clientSecret, env.ACCESS_CLIENT_SECRET)) {
		return { id: `service:${request.clientId}`, kind: "service" };
	}
	return null;
}

// Analyses and uploads belong to whoever created them.
export function owns(actor: Actor, owner: string): boolean {
	return actor.kind === "development" || actor.id === owner;
}
