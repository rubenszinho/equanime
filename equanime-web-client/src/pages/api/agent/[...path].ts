import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAgentGateway } from "@rubrion/beholder-server/gateway";
import { currentAccount } from "../../../lib/session";

export const prerender = false;

// The chat's door: the signed-in person goes to equanime-agent through its service binding.
const gateway = createAgentGateway({
	agent: () => env.AGENT,
	identify: async (c) => {
		const account = await currentAccount(c.req.raw);
		return account?.confirmed ? { tenant: "equanime", person: account.email, role: "member", name: account.name } : null;
	},
});

export const ALL: APIRoute = ({ request }) => {
	const url = new URL(request.url);
	url.pathname = url.pathname.replace(/^\/api\/agent/, "") || "/";
	return gateway.fetch(new Request(url, request), env);
};
