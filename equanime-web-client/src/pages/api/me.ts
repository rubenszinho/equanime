import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { accessEmail, displayName } from "../../lib/access";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const email = await accessEmail(request, env);
	if (!email) return Response.json({ error: "Sessão não encontrada." }, { status: 401 });
	return Response.json({ email, name: displayName(email) }, { headers: { "cache-control": "private, no-store" } });
};
