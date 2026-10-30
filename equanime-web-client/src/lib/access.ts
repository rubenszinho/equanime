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

export const displayName = (email: string) => email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
