import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// The signed-in email. Access already guards the hostname; the Worker checks the token itself too,
// since the agent trusts whoever this says. Locally, DEV_USER stands in.
export async function accessEmail(request: Request, env: { TEAM_DOMAIN?: string; POLICY_AUD?: string; DEV_USER?: string }): Promise<string | null> {
	const token = request.headers.get("cf-access-jwt-assertion");
	const team = String(env.TEAM_DOMAIN ?? "").replace(/\/$/, "");
	if (!token || !team || !env.POLICY_AUD) return env.DEV_USER ? env.DEV_USER.toLowerCase() : null;
	try {
		jwks ??= createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
		const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: env.POLICY_AUD });
		return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
	} catch {
		return null;
	}
}

const names = new Map<string, string>();

// The name the identity provider gives (Google), from Access's identity endpoint with the visitor's
// own session cookie. Empty when there is none: the assistant then greets without a name instead of
// guessing one from the email.
export async function displayName(request: Request, email: string): Promise<string> {
	const known = names.get(email);
	if (known !== undefined) return known;
	const cookie = request.headers.get("cookie") ?? "";
	if (!/CF_Authorization=/.test(cookie)) return "";
	try {
		const reply = await fetch(new URL("/cdn-cgi/access/get-identity", request.url), { headers: { cookie } });
		const identity = reply.ok ? ((await reply.json()) as { name?: unknown; email?: unknown }) : null;
		const name = identity && String(identity.email).toLowerCase() === email && typeof identity.name === "string" ? identity.name.trim().slice(0, 80) : "";
		names.set(email, name);
		return name;
	} catch {
		return "";
	}
}
