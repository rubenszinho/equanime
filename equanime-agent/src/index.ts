// The Equânime agent Worker, with two doors over the same agent and tools:
//   /v1/*  OpenAI-compatible (rubry.ai, OpenWebUI), with a key per client, on agent.equanime.rubrion.ai
//   /*     agent-kit's routes for the web app's chat, only through its service binding
// Either way the person asking is put where the tools find it (caller.ts), so equanime-api
// keeps each person's analyses to them.
import { createAgentWorker } from "@rubrion/agent-kit-server";
import { createAgentServer, defineAgents, workersAI } from "@rubrion/mastra-cloudflare";
import { BANCA, MODEL, SPEC } from "./agent";
import { asPerson } from "./caller";

const today = () => `Hoje é ${new Date().toISOString().slice(0, 10)} (UTC).`;

const chat = createAgentWorker<Env>({
	agents: [BANCA],
	ai: (env) => env.AI,
	memory: (env) => env.MEMORY,
	defaultModel: { provider: "workers-ai", model: MODEL },
	context: today,
	// The question carries the attachment lines (one per CV) besides what the person wrote.
	maxQuestion: 6000,
	scope: ({ caller }, next) => asPerson(caller.person, next),
	onUsage: (u) => console.log(JSON.stringify({ event: "agent_usage", door: "chat", agent: u.agent, model: u.model, tokens: u.inputTokens + u.outputTokens, status: u.status })),
});

const v1 = createAgentServer<typeof SPEC, Env>({
	agents: defineAgents([SPEC]),
	name: "equanime",
	defaultModel: (env) => workersAI(env.AI, MODEL, { thinking: false }),
	planner: false,
	maxSteps: 6,
});

function safeEqual(left: string, right: string): boolean {
	const a = new TextEncoder().encode(left);
	const b = new TextEncoder().encode(right);
	let diff = a.length ^ b.length;
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
	return diff === 0;
}

const PERSON = /^[a-z0-9][a-z0-9@._:+-]{1,180}$/;

/** The person behind a /v1 call, from the client's key; null when the key is wrong. */
export function v1Person(request: Request, env: Env): string | null {
	const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
	if (env.V1_KEY_RUBRY && safeEqual(key, env.V1_KEY_RUBRY)) {
		const id = request.headers.get("x-equanime-person")?.trim().toLowerCase() ?? "";
		return PERSON.test(id) ? `rubry:${id}` : null;
	}
	if (env.V1_KEY_OPENWEBUI && safeEqual(key, env.V1_KEY_OPENWEBUI)) {
		// With ENABLE_FORWARD_USER_INFO_HEADERS, OpenWebUI names its user; without it, all share one.
		const email = request.headers.get("x-openwebui-user-email")?.trim().toLowerCase() ?? "";
		return PERSON.test(email) ? `openwebui:${email}` : "service:openwebui";
	}
	return null;
}

const unauthorized = () => Response.json({ error: { message: "Invalid API key", type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 });

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
			const person = v1Person(request, env);
			if (!person) return unauthorized();
			return asPerson(person, () => v1.fetch(request, env));
		}
		// agent-kit trusts the caller headers, so its routes never answer on the public host.
		if (url.hostname === env.PUBLIC_HOST) return Response.json({ error: "Not found" }, { status: 404 });
		return chat.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
