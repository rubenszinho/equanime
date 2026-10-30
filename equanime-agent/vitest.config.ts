import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				// The tests never call the model: no remote Workers AI session.
				remoteBindings: false,
				miniflare: {
					bindings: { AGENT_KEY: "agent-key", V1_KEY_RUBRY: "rubry-key", V1_KEY_OPENWEBUI: "owui-key", WEB_URL: "https://equanime.test" },
					// equanime-api stand-in: echoes who the tools say they act for.
					serviceBindings: {
						API(request: Request) {
							const person = request.headers.get("x-equanime-person");
							if (request.headers.get("authorization") !== "Bearer agent-key" || !person) return Response.json({ message: "Autenticação obrigatória." }, { status: 401 });
							const url = new URL(request.url);
							if (url.pathname === "/analises" && request.method === "GET") return Response.json({ analyses: [{ analysis_id: "a1", status: "completed", candidate_name: person, work_title: null, summary: null, web_url: null, created_at: "2026-10-30" }] });
							if (url.pathname === "/analises/missing") return Response.json({ message: "Análise não encontrada." }, { status: 404 });
							return Response.json({
								analysis_id: "a1", type: "academic", status: "completed_with_warnings", message: "Concluída.", assistant_summary: "Um possível conflito.",
								candidate: { name: "João", lattes_url: "", collection_status: "complete", collection_message: null },
								advisor: null, summary: { reviewers_analyzed: 1, without_identified_conflict: 0, potential_conflict: 0, inconclusive: 1 },
								reviewers: [{ reviewer: { name: "Rita", role: "titular", lattes_url: "", collection_status: "needs_upload", collection_message: null, detected_name: null }, status_label: "ANÁLISE INCONCLUSIVA",
									checks: { coauthorship: { detected: false, inconclusive: true, result: "Currículo não lido." }, recent_advisor_relationship: { detected: false, inconclusive: false, result: "", applicable: false }, joint_research_projects: { detected: false, inconclusive: true, result: "Currículo não lido." } } }],
								limitations: ["Currículo de Rita não lido."], needs_upload: true, web_url: "https://equanime.test/analises/a1", report_url: "/analises/a1/relatorio.pdf",
							});
						},
					},
				},
		}),
	],
});
