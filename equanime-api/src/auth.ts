import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { logInfo } from "./log";
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

export const authenticate: MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: { actor: Actor } }> = async (c, next) => {
	if (c.req.path === "/health" || c.req.path === "/ready") {
		await next();
		return;
	}
	const actor = await identify(c.env, c.req.header("cf-access-jwt-assertion"), c.req.header("cf-access-client-id") ?? "", c.req.header("cf-access-client-secret") ?? "");
	if (!actor) return c.json({ status: "error", error_type: "unauthorized", message: "Autenticação do Cloudflare Access é obrigatória." }, 401);
	c.set("actor", actor);
	logInfo("request_authenticated", { actor: actor.id, kind: actor.kind, path: c.req.path });
	await next();
};

async function identify(env: CloudflareBindings, token: string | undefined, clientId: string, clientSecret: string): Promise<Actor | null> {
	if (envString(env, "AUTH_MODE") === "dev") return { id: "development", kind: "development" };
	const teamDomain = envString(env, "TEAM_DOMAIN");
	const audience = envString(env, "POLICY_AUD");
	if (token && teamDomain && audience) {
		try {
			jwks ??= createRemoteJWKSet(new URL(`${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`));
			const { payload } = await jwtVerify(token, jwks, { issuer: teamDomain, audience });
			const claims = payload as Record<string, unknown>;
			const email = typeof claims.email === "string" ? claims.email : payload.sub ?? "access-user";
			return { id: String(email), kind: claims.service_token_id ? "service" : "user" };
		} catch {
			return null;
		}
	}
	const configuredId = envString(env, "ACCESS_CLIENT_ID");
	if (configuredId && env.ACCESS_CLIENT_SECRET && safeEqual(clientId, configuredId) && safeEqual(clientSecret, env.ACCESS_CLIENT_SECRET)) {
		return { id: `service:${clientId}`, kind: "service" };
	}
	return null;
}
