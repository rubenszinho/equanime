import { env } from "cloudflare:workers";

// "Entrar com Google": the OAuth client Access used (GCP project rubrion), now Equânime's own.
// Any Google account may sign in; the email decides the plan as for any account (usp.br is free).
const vars = env as unknown as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };
export const STATE_COOKIE = "eq_g";

export const googleReady = () => Boolean(vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET);
export const callbackUrl = (request: Request) => new URL("/api/conta/google/retorno", request.url).href;

export function authorizeUrl(request: Request, state: string): string {
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.search = new URLSearchParams({
		client_id: vars.GOOGLE_CLIENT_ID ?? "",
		redirect_uri: callbackUrl(request),
		response_type: "code",
		scope: "openid email profile",
		state,
		prompt: "select_account",
	}).toString();
	return url.href;
}

type Claims = { iss?: string; aud?: string; exp?: number; email?: string; email_verified?: boolean; name?: string };

/** The verified email and name Google gives for `code`, or null. The ID token comes straight from
 *  Google's token endpoint over TLS, so its claims are checked without fetching Google's keys. */
export async function exchange(request: Request, code: string): Promise<{ email: string; name: string } | null> {
	const reply = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: vars.GOOGLE_CLIENT_ID ?? "",
			client_secret: vars.GOOGLE_CLIENT_SECRET ?? "",
			redirect_uri: callbackUrl(request),
			grant_type: "authorization_code",
		}),
	}).catch(() => null);
	if (!reply?.ok) return null;
	const token = ((await reply.json()) as { id_token?: string }).id_token ?? "";
	const part = token.split(".")[1];
	if (!part) return null;
	let claims: Claims;
	try {
		claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0))));
	} catch {
		return null;
	}
	const issuer = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
	if (!issuer || claims.aud !== vars.GOOGLE_CLIENT_ID || !claims.exp || claims.exp * 1000 < Date.now()) return null;
	if (!claims.email || claims.email_verified !== true) return null;
	return { email: claims.email.toLowerCase(), name: (claims.name ?? "").trim().slice(0, 120) };
}
