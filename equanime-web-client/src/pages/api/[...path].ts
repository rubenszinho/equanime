import type { APIRoute } from "astro";
import { callApi } from "../../lib/session";

export const prerender = false;

// Only the API's own routes go through; the browser never reaches other paths.
const allowed = /^(analises(\/[0-9a-z-]+(\/(relatorio\.pdf|reprocessar))?)?|curriculos|admin\/(usuarios|creditos))$/;
// What the browser may tell the API; identity comes only from the session cookie.
const passed = ["content-type", "accept", "idempotency-key"];

export const ALL: APIRoute = async ({ request, params }) => {
	const segments = params.path;
	const path = Array.isArray(segments) ? segments.join("/") : segments ?? "";
	if (!allowed.test(path)) return Response.json({ status: "error", error_type: "not_found", message: "Rota não encontrada." }, { status: 404 });
	const headers = new Headers();
	for (const name of passed) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
	return callApi(request, `/${path}${new URL(request.url).search}`, { method: request.method, headers, body });
};
