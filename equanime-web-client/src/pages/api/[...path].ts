import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const ALL: APIRoute = async ({ request, params }) => {
	const segments = params.path;
	const path = Array.isArray(segments) ? segments.join("/") : segments ?? "";
	const incoming = new URL(request.url);
	const headers = new Headers(request.headers);
	headers.delete("host");
	const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
	const init: RequestInit = { method: request.method, headers, body };
	const base = String(env.EQUANIME_API_URL ?? "");
	if (base) return fetch(new URL(`${path}${incoming.search}`, base.endsWith("/") ? base : `${base}/`), init);
	return env.EQUANIME_API.fetch(new Request(new URL(`https://equanime-api/${path}${incoming.search}`), init));
};
