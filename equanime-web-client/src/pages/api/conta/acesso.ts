import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { callApi, setSession } from "../../../lib/session";

export const prerender = false;

const secret = () => String((env as unknown as { TURNSTILE_SECRET?: string }).TURNSTILE_SECRET ?? "");

// Sign-up and "forgot password" send email; with TURNSTILE_SECRET set they need a fresh Turnstile token.
async function human(token: unknown, request: Request): Promise<boolean> {
	if (!secret()) return true;
	const form = new FormData();
	form.set("secret", secret());
	form.set("response", String(token ?? ""));
	form.set("remoteip", request.headers.get("cf-connecting-ip") ?? "");
	const reply = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).catch(() => null);
	return Boolean(reply?.ok && ((await reply.json()) as { success?: boolean }).success);
}

// Sign in, sign up, forgot and reset: the API answers with a session token, kept here in the cookie
// and never handed to the page.
export const POST: APIRoute = async ({ request, cookies }) => {
	const body = (await request.json().catch(() => null)) as { action?: string; turnstile?: string } | null;
	if (!body) return Response.json({ status: "error", error_type: "body", message: "Pedido inválido." }, { status: 400 });
	if ((body.action === "register" || body.action === "forgot") && !(await human(body.turnstile, request))) {
		return Response.json({ status: "error", error_type: "captcha", message: "Não foi possível confirmar que você é uma pessoa. Recarregue a página e tente de novo." }, { status: 403 });
	}
	const { turnstile: _turnstile, ...rest } = body;
	const reply = await callApi(request, "/conta/acesso", { method: "POST", headers: new Headers({ "content-type": "application/json" }), body: JSON.stringify(rest) });
	const answer = (await reply.json().catch(() => ({}))) as { token?: string } & Record<string, unknown>;
	if (answer.token) setSession(cookies, answer.token);
	const { token: _token, ...visible } = answer;
	return Response.json(visible, { status: reply.status, headers: { "cache-control": "no-store" } });
};
