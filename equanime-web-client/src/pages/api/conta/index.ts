import type { APIRoute } from "astro";
import { callApi, clearSession, currentAccount } from "../../../lib/session";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const account = await currentAccount(request);
	if (!account) return Response.json({ status: "error", error_type: "unauthorized", message: "Entre na sua conta." }, { status: 401 });
	return Response.json(account, { headers: { "cache-control": "private, no-store" } });
};

// verify, resend, logout; DELETE removes the account. Signing out or deleting also drops the cookie.
const forward = (method: string): APIRoute => async ({ request, cookies }) => {
	const body = await request.text();
	const reply = await callApi(request, "/conta", { method, headers: new Headers({ "content-type": "application/json" }), body });
	const answer = await reply.json().catch(() => ({}));
	const action = method === "DELETE" ? "delete" : (JSON.parse(body || "{}") as { action?: string }).action;
	if (action === "delete" ? reply.ok : action === "logout") clearSession(cookies);
	return Response.json(answer, { status: reply.status, headers: { "cache-control": "no-store" } });
};

export const POST = forward("POST");
export const DELETE = forward("DELETE");
