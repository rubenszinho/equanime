import type { APIRoute } from "astro";
import { currentAccount } from "../../lib/session";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const account = await currentAccount(request);
	if (!account?.confirmed) return Response.json({ error: "Sessão não encontrada." }, { status: 401 });
	return Response.json({ email: account.email, name: account.name }, { headers: { "cache-control": "private, no-store" } });
};
