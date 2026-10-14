import { OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { authenticate, type Actor } from "./auth";
import { analysisRoutes } from "./routes/analises";
import { logError } from "./log";

type AppEnv = { Bindings: CloudflareBindings; Variables: { actor: Actor } };

export function createApp(): OpenAPIHono<AppEnv> {
	const app = new OpenAPIHono<AppEnv>();
	app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));
	app.use("*", authenticate);
	app.onError((error, c) => {
		logError("request_failed", { path: c.req.path, error: error.message });
		return c.json({ status: "error", error_type: "unexpected_error", message: "A solicitação não pôde ser processada." }, 500);
	});
	app.get("/health", (c) => c.json({ status: "ok", service: "equanime-api" }));
	app.get("/ready", async (c) => {
		try {
			await c.env.DB.prepare("SELECT 1 AS ok").first();
			return c.json({ status: "ready" });
		} catch (error) {
			logError("readiness_failed", { error: error instanceof Error ? error.message : "unknown" });
			return c.json({ status: "error", error_type: "not_ready", message: "A base da aplicação não está disponível." }, 503);
		}
	});
	app.route("/", analysisRoutes);
	app.doc("/openapi.json", {
		openapi: "3.0.0",
		info: {
			title: "Equânime — Análise de conflito de interesses",
			version: "1.0.0",
			description: [
				"API para analisar possíveis conflitos de interesse em bancas acadêmicas ou de concurso a partir de Currículos Lattes.",
				"Comece por POST /analises. Candidato e avaliadores são obrigatórios. Orientador e título são opcionais.",
				"A presença do orientador seleciona banca acadêmica. Sua ausência seleciona concurso ou processo seletivo.",
				"A operação é assíncrona. Consulte GET /analises/{analysis_id} e interprete o campo message até um estado terminal.",
				"Obtenha o PDF em GET /analises/{analysis_id}/relatorio.pdf somente depois que report_url estiver preenchido.",
				"As regras são executadas pelo serviço. Não reconstrua a decisão a partir de dados brutos quando assistant_summary estiver presente.",
				"Autenticação: Cloudflare Access, por Cf-Access-Jwt-Assertion ou pelos cabeçalhos CF-Access-Client-Id e CF-Access-Client-Secret.",
			].join(" "),
		},
	});
	return app;
}
