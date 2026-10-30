import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAgentGateway } from "@rubrion/agent-kit-server/gateway";
import { accessEmail, displayName } from "../../../lib/access";

export const prerender = false;

// The chat's door: the signed-in person goes to equanime-agent through its service binding.
const gateway = createAgentGateway({
	agent: () => env.AGENT,
	identify: async (c) => {
		const email = await accessEmail(c.req.raw, env);
		return email ? { tenant: "equanime", person: email, role: "member", name: displayName(email) } : null;
	},
});

export const ALL: APIRoute = ({ request }) => {
	const url = new URL(request.url);
	url.pathname = url.pathname.replace(/^\/api\/agent/, "") || "/";
	return gateway.fetch(new Request(url, request), env);
};
