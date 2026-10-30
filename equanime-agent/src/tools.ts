// The agent's tools: thin calls to equanime-api, which applies the rules. They return facts
// already decided by the service, and { error } instead of throwing, so the agent explains it.
import { env } from "cloudflare:workers";
import { createTool, z } from "@rubrion/agent-kit-server";
import { currentPerson } from "./caller";

type Rule = { detected: boolean; inconclusive: boolean; result: string; applicable?: boolean };
type Participant = { name: string; lattes_url: string; collection_status: string; collection_message: string | null };
type Analysis = {
	analysis_id: string;
	type: "academic" | "selection";
	status: string;
	message: string;
	assistant_summary: string | null;
	candidate: Participant;
	advisor: Participant | null;
	summary: Record<string, number> | null;
	reviewers: Array<{
		reviewer: Participant & { role: string; detected_name: string | null };
		status_label: string;
		checks: { coauthorship: Rule; recent_advisor_relationship: Rule; joint_research_projects: Rule };
	}>;
	limitations: string[];
	needs_upload: boolean;
	web_url: string | null;
	report_url: string | null;
};

const TERMINAL = new Set(["completed", "completed_with_warnings", "failed"]);
const RULES = { coauthorship: "Coautoria", recent_advisor_relationship: "Relação recente com o orientador", joint_research_projects: "Projetos de pesquisa em conjunto" } as const;

async function api<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
	const headers = new Headers(init.headers);
	headers.set("authorization", `Bearer ${env.AGENT_KEY}`);
	headers.set("x-equanime-person", currentPerson());
	if (init.body) headers.set("content-type", "application/json");
	const response = await env.API.fetch(new Request(`https://equanime-api${path}`, { ...init, headers }));
	const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
	if (!response.ok || !body) return { ok: false, error: body?.message ?? `A API respondeu ${response.status}.` };
	return { ok: true, body };
}

const web = (path: string | null) => (path ? `${String(env.WEB_URL).replace(/\/$/, "")}/api${path}` : null);

// What the model needs to answer: the service's own summary, each verdict with its rules, and what is missing.
export function summarize(analysis: Analysis) {
	const done = TERMINAL.has(analysis.status);
	return {
		analise: analysis.analysis_id,
		tipo: analysis.type === "academic" ? "banca acadêmica" : "concurso ou processo seletivo",
		estado: analysis.status,
		concluida: done,
		mensagem: analysis.message,
		sintese: analysis.assistant_summary,
		totais: analysis.summary,
		avaliadores: done
			? analysis.reviewers.map((item) => ({
					nome: item.reviewer.name,
					papel: item.reviewer.role,
					resultado: item.status_label,
					regras: Object.entries(RULES)
						.filter(([key]) => item.checks[key as keyof typeof RULES].applicable !== false)
						.map(([key, title]) => ({ regra: title, resultado: item.checks[key as keyof typeof RULES].result })),
				}))
			: [],
		curriculos_para_enviar: [analysis.candidate, analysis.advisor, ...analysis.reviewers.map((item) => item.reviewer)]
			.filter((person): person is Participant => Boolean(person) && person!.collection_status === "needs_upload")
			.map((person) => person.name),
		limitacoes: done ? analysis.limitations : [],
		pagina: analysis.web_url,
		pdf: web(analysis.report_url),
	};
}

const person = z.object({
	nome: z.string().min(3).describe("Nome como o usuário informou."),
	lattes: z.string().describe("Endereço do Currículo Lattes: http://lattes.cnpq.br/ seguido de 16 dígitos."),
});

async function digest(text: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export const criarAnalise = createTool({
	id: "criar_analise",
	description: "Inicia a análise de conflito de interesses de uma banca. Use só com o candidato e todos os avaliadores (nome, Lattes e papel) informados pelo usuário. Retorna o identificador; depois use consultar_analise.",
	inputSchema: z.object({
		candidato: person,
		orientador: person.optional().describe("Só em banca acadêmica. Sem orientador, é concurso ou processo seletivo."),
		titulo_trabalho: z.string().optional(),
		avaliadores: z.array(person.extend({ papel: z.enum(["titular", "suplente"]) })).min(1).max(12),
	}),
	execute: async (input) => {
		const board = {
			candidate: { name: input.candidato.nome, lattes_url: input.candidato.lattes },
			...(input.orientador ? { advisor: { name: input.orientador.nome, lattes_url: input.orientador.lattes } } : {}),
			...(input.titulo_trabalho ? { work_title: input.titulo_trabalho } : {}),
			reviewers: input.avaliadores.map((item) => ({ name: item.nome, lattes_url: item.lattes, role: item.papel })),
		};
		// The same board asked twice in a conversation is the same analysis.
		const key = await digest(JSON.stringify(board));
		const reply = await api<Analysis>("/analises", { method: "POST", headers: { "idempotency-key": `agent-${key}` }, body: JSON.stringify(board) });
		return reply.ok ? summarize(reply.body) : { error: reply.error };
	},
});

export const consultarAnalise = createTool({
	id: "consultar_analise",
	description: "Andamento e resultado de uma análise pelo identificador. Espera até cerca de 20 segundos pelo fim; se ainda não concluiu, diga a mensagem ao usuário e consulte de novo.",
	inputSchema: z.object({ analise: z.string().describe("Identificador devolvido por criar_analise ou minhas_analises.") }),
	execute: async ({ analise }) => {
		const until = Date.now() + 20_000;
		for (;;) {
			const reply = await api<Analysis>(`/analises/${encodeURIComponent(analise)}`);
			if (!reply.ok) return { error: reply.error };
			if (TERMINAL.has(reply.body.status) || Date.now() > until) return summarize(reply.body);
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	},
});

export const minhasAnalises = createTool({
	id: "minhas_analises",
	description: "As análises que este usuário já fez, da mais recente para a mais antiga, com estado e totais.",
	inputSchema: z.object({}),
	execute: async () => {
		const reply = await api<{ analyses: Array<{ analysis_id: string; status: string; candidate_name: string | null; work_title: string | null; summary: unknown; web_url: string | null; created_at: string }> }>("/analises");
		if (!reply.ok) return { error: reply.error };
		return {
			analises: reply.body.analyses.map((item) => ({ analise: item.analysis_id, candidato: item.candidate_name, titulo: item.work_title, estado: item.status, totais: item.summary, pagina: item.web_url, criada_em: item.created_at })),
		};
	},
});

export const tools = { criar_analise: criarAnalise, consultar_analise: consultarAnalise, minhas_analises: minhasAnalises };
