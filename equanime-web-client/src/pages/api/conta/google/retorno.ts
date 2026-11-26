import type { APIRoute } from "astro";
import { exchange, STATE_COOKIE } from "../../../../lib/google";
import { callApi, setSession } from "../../../../lib/session";

export const prerender = false;

// Google's answer: check the state, trade the code for the verified email, sign in (or create) the account.
export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
	const [state, back] = (cookies.get(STATE_COOKIE)?.value ?? "").split("|");
	cookies.delete(STATE_COOKIE, { path: "/api/conta/google" });
	const failed = redirect(`/entrar?erro=google&volta=${encodeURIComponent(back || "/analises")}`);
	const code = url.searchParams.get("code");
	if (!state || !code || url.searchParams.get("state") !== state) return failed;
	const person = await exchange(request, code);
	if (!person) return failed;
	const reply = await callApi(request, "/conta/acesso", { method: "POST", headers: new Headers({ "content-type": "application/json" }), body: JSON.stringify({ action: "google", ...person }) });
	const answer = (await reply.json().catch(() => ({}))) as { token?: string };
	if (!reply.ok || !answer.token) return failed;
	setSession(cookies, answer.token);
	return redirect(back || "/analises");
};
