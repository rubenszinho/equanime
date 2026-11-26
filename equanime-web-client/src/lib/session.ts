import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";

// Signed in: cookie `eq_u` holds a random token for 30 days; equanime-api keeps only its hash and
// resolves it on every call (with WEB_KEY, which only this Worker holds).
export const COOKIE = "eq_u";
export const SESSION_TTL = 30 * 24 * 60 * 60;

export type Account = {
	email: string;
	name: string;
	confirmed: boolean;
	created: string;
	institution: string | null;
	unlimited: boolean;
	credits: number | null;
	admin: boolean;
	/** False for accounts that only sign in with Google. */
	has_password?: boolean;
	retention_days: number;
	history: Array<{ kind: string; n: number; analysis_id: string | null; note: string | null; created: string }>;
};

const vars = env as unknown as { EQUANIME_API_URL?: string; WEB_KEY?: string; DEV_USER?: string };

/** Local dev without an API (CI's end-to-end tests), or with DEV_USER and no session: a stand-in account. */
function devAccount(token: string | undefined): Account | null {
	if (!import.meta.env.DEV) return null;
	const email = String(vars.DEV_USER ?? "").toLowerCase();
	if (vars.EQUANIME_API_URL && (!email || token)) return null;
	return { email: email || "dev@usp.br", name: "Pessoa de teste", confirmed: true, created: new Date().toISOString(), institution: "usp.br", unlimited: true, credits: null, admin: true, retention_days: 90, history: [] };
}

export function tokenOf(request: Request): string | undefined {
	const match = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)eq_u=([a-f0-9]{64})(?:;|$)/);
	return match?.[1];
}

// Limits on sign-ups and codes count per network: a daily hash of the address, never the address.
async function network(request: Request): Promise<string> {
	const ip = request.headers.get("cf-connecting-ip") ?? "local";
	const data = new TextEncoder().encode(`${new Date().toISOString().slice(0, 10)}|${ip}|${vars.WEB_KEY ?? ""}`);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A call to equanime-api as the visitor (their session, if any). */
export async function callApi(request: Request, path: string, init: { method?: string; body?: BodyInit | null; headers?: Headers } = {}): Promise<Response> {
	const headers = init.headers ?? new Headers();
	headers.set("authorization", `Bearer ${vars.WEB_KEY ?? ""}`);
	headers.set("x-equanime-net", await network(request));
	const token = tokenOf(request);
	if (token) headers.set("x-equanime-session", token);
	else headers.delete("x-equanime-session");
	const options: RequestInit = { method: init.method ?? "GET", headers, body: init.body ?? undefined };
	const base = String(vars.EQUANIME_API_URL ?? "");
	if (base) return fetch(new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`), options);
	return env.EQUANIME_API.fetch(new Request(new URL(`https://equanime-api/${path.replace(/^\//, "")}`), options));
}

/** The signed-in account, or null. */
export async function currentAccount(request: Request): Promise<Account | null> {
	const token = tokenOf(request);
	const dev = devAccount(token);
	if (dev) return dev;
	if (!token) return null;
	try {
		const reply = await callApi(request, "/conta");
		return reply.ok ? ((await reply.json()) as Account) : null;
	} catch {
		return null;
	}
}

export function setSession(cookies: AstroCookies, token: string): void {
	cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL });
}

export function clearSession(cookies: AstroCookies): void {
	cookies.delete(COOKIE, { path: "/" });
}
