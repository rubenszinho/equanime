import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Actor } from "../auth";
import { parseLattes, canonicalJson, deterministicId, sha256 } from "../normalize";
import { countRecent, findByIdempotency, getAnalysis, insertAnalysis, insertParticipant } from "../repository";
import { runAnalysis } from "../pipeline";
import { presentAnalysis } from "../present";
import { AnalysisSchema, CreateAnalysisSchema, ErrorSchema } from "../schemas";
import { logError, logInfo } from "../log";
import { envString } from "../settings";

type AppEnv = { Bindings: CloudflareBindings; Variables: { actor: Actor } };

const createRouteDef = createRoute({
	method: "post",
	path: "/analises",
	tags: ["Análises"],
	summary: "Inicia uma análise de conflito de interesses",
	description: "Use este endpoint quando o usuário já tiver informado o candidato, os avaliadores e, se existirem, o orientador e o título. A operação registra a análise, inicia a coleta dos Currículos Lattes e retorna imediatamente. Consulte GET /analises/{analysis_id} até o estado terminal. Não conclua ausência de conflito antes do estado completed ou completed_with_warnings.",
	request: {
		body: {
			content: { "application/json": { schema: CreateAnalysisSchema } },
			required: true,
		},
		headers: z.object({
			"idempotency-key": z.string().optional().openapi({ description: "Chave opcional para repetir com segurança a mesma solicitação." }),
		}),
	},
	responses: {
		202: { description: "Análise aceita e em processamento.", content: { "application/json": { schema: AnalysisSchema } } },
		200: { description: "A mesma chave de idempotência já possuía esta análise.", content: { "application/json": { schema: AnalysisSchema } } },
		400: { description: "Os dados da banca são inválidos.", content: { "application/json": { schema: ErrorSchema } } },
		409: { description: "A chave de idempotência foi reutilizada com dados diferentes.", content: { "application/json": { schema: ErrorSchema } } },
		429: { description: "Limite de análises do solicitante foi atingido.", content: { "application/json": { schema: ErrorSchema } } },
		404: { description: "A análise registrada não pôde ser relida.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

const getRouteDef = createRoute({
	method: "get",
	path: "/analises/{analysis_id}",
	tags: ["Análises"],
	summary: "Consulta o andamento e o resultado de uma análise",
	description: "Use este endpoint depois de iniciar a análise. Estados intermediários são pending, collecting_lattes, analyzing e generating_report. Estados terminais são completed, completed_with_warnings e failed. A mensagem explica o estado para o usuário. Quando houver report_url, o PDF pode ser obtido nesse caminho.",
	request: { params: z.object({ analysis_id: z.string().openapi({ description: "Identificador retornado por POST /analises." }) }) },
	responses: {
		200: { description: "Estado atual da análise.", content: { "application/json": { schema: AnalysisSchema } } },
		404: { description: "Análise não encontrada.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

const reportRouteDef = createRoute({
	method: "get",
	path: "/analises/{analysis_id}/relatorio.pdf",
	tags: ["Análises"],
	summary: "Obtém o relatório PDF da análise",
	description: "Use este endpoint somente quando GET /analises/{analysis_id} informar report_url. O retorno é o arquivo PDF para apresentar ao usuário. Se o relatório ainda não existir, aguarde a análise terminar e consulte novamente.",
	request: { params: z.object({ analysis_id: z.string() }) },
	responses: {
		200: { description: "Relatório PDF.", content: { "application/pdf": { schema: z.string() } } },
		404: { description: "Análise não encontrada.", content: { "application/json": { schema: ErrorSchema } } },
		409: { description: "O relatório ainda não está disponível.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

export const analysisRoutes = new OpenAPIHono<AppEnv>();

analysisRoutes.openapi(createRouteDef, async (c) => {
	const actor = c.get("actor");
	const body = c.req.valid("json");
	const maxReviewers = Number(c.env.MAX_REVIEWERS || "12");
	if (body.reviewers.length > maxReviewers) {
		return c.json({ status: "error" as const, error_type: "too_many_reviewers", message: `Informe no máximo ${maxReviewers} avaliadores.` }, 400);
	}
	const people = [body.candidate, body.advisor, ...body.reviewers].filter((person): person is NonNullable<typeof person> => Boolean(person));
	const parsed = people.map((person) => ({ person, lattes: parseLattes(person.lattes_url) }));
	const invalid = parsed.find((item) => !item.lattes.ok);
	if (invalid) return c.json({ status: "error" as const, error_type: "invalid_lattes_url", message: `URL Lattes inválida para ${invalid.person.name}.` }, 400);
	const ids = parsed.map((item) => ("id" in item.lattes ? item.lattes.id : ""));
	const candidateId = ids[0];
	const reviewerIds = ids.slice(body.advisor ? 2 : 1);
	if (reviewerIds.includes(candidateId)) return c.json({ status: "error" as const, error_type: "candidate_is_reviewer", message: "O candidato não pode ser incluído como membro da própria banca." }, 400);
	if (new Set(reviewerIds).size !== reviewerIds.length) return c.json({ status: "error" as const, error_type: "duplicate_reviewer", message: "Há avaliadores duplicados na banca." }, 400);

	const payloadHash = await sha256(canonicalJson(body));
	const idempotencyKey = c.req.header("idempotency-key") ?? null;
	if (idempotencyKey) {
		const existing = await findByIdempotency(c.env.DB, idempotencyKey);
		if (existing) {
			if (existing.payload_hash !== payloadHash) return c.json({ status: "error" as const, error_type: "idempotency_conflict", message: "A chave de idempotência já foi usada com dados diferentes." }, 409);
			const current = await presentAnalysis(c.env.DB, existing.id);
			if (!current) return c.json({ status: "error" as const, error_type: "not_found", message: "Análise não encontrada." }, 404);
			return c.json(current, 200);
		}
	}
	const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const recent = await countRecent(c.env.DB, actor.id, since);
	if (recent >= Number(c.env.MAX_ANALYSES_PER_HOUR || "30")) return c.json({ status: "error" as const, error_type: "rate_limited", message: "Limite horário de análises atingido." }, 429);

	const now = new Date().toISOString();
	const id = idempotencyKey ? await deterministicId(idempotencyKey) : crypto.randomUUID();
	const type = body.advisor ? "academic" : "selection";
	await insertAnalysis(c.env.DB, {
		id, idempotency_key: idempotencyKey, payload_hash: payloadHash, type, status: "pending",
		message: "A análise foi registrada e aguarda processamento.", work_title: body.work_title ?? null, actor: actor.id,
		assistant_summary: null, summary_json: null, limitations: [], report_key: null, workflow_instance_id: null,
		error_message: null, timings: {}, created_at: now, updated_at: now, completed_at: null,
	});
	const rows = [
		{ kind: "candidate" as const, role: null, person: body.candidate },
		...(body.advisor ? [{ kind: "advisor" as const, role: null, person: body.advisor }] : []),
		...body.reviewers.map((person) => ({ kind: "reviewer" as const, role: person.role, person })),
	];
	for (const row of rows) {
		const lattes = parseLattes(row.person.lattes_url);
		await insertParticipant(c.env.DB, {
			id: crypto.randomUUID(), analysis_id: id, kind: row.kind, reviewer_role: row.role, requested_name: row.person.name,
			detected_name: null, lattes_url: row.person.lattes_url, lattes_id: lattes.ok ? lattes.id : "", collection_status: "pending",
			collection_error: null, consulted_at: null, snapshot_key: null, warnings: [],
		});
	}
	logInfo("analysis_created", { analysis_id: id, type, curricula_requested: rows.length, actor: actor.id });
	if (envString(c.env, "EXECUTION_MODE") === "workflow") {
		try {
			const instance = await c.env.ANALYSIS_WORKFLOW.create({ id, params: { analysisId: id } });
			await c.env.DB.prepare("UPDATE analyses SET workflow_instance_id = ? WHERE id = ?").bind(instance.id, id).run();
		} catch (error) {
			logError("workflow_create_failed", { analysis_id: id, error: error instanceof Error ? error.message : "unknown" });
			c.executionCtx.waitUntil(runAnalysis(c.env, id));
		}
	} else if (envString(c.env, "EXECUTION_MODE") === "inline") {
		c.executionCtx.waitUntil(runAnalysis(c.env, id));
	}
	const created = await presentAnalysis(c.env.DB, id);
	if (!created) return c.json({ status: "error" as const, error_type: "not_found", message: "Análise não encontrada." }, 404);
	return c.json(created, 202);
});

analysisRoutes.openapi(getRouteDef, async (c) => {
	const { analysis_id: id } = c.req.valid("param");
	const analysis = await presentAnalysis(c.env.DB, id);
	if (!analysis) return c.json({ status: "error" as const, error_type: "not_found", message: "Análise não encontrada." }, 404);
	return c.json(analysis, 200);
});

analysisRoutes.openapi(reportRouteDef, async (c) => {
	const { analysis_id: id } = c.req.valid("param");
	const analysis = await getAnalysis(c.env.DB, id);
	if (!analysis) return c.json({ status: "error" as const, error_type: "not_found", message: "Análise não encontrada." }, 404);
	if (!analysis.report_key) return c.json({ status: "error" as const, error_type: "report_not_ready", message: "O relatório ainda não está disponível." }, 409);
	const object = await c.env.EVIDENCE.get(analysis.report_key);
	if (!object) return c.json({ status: "error" as const, error_type: "report_missing", message: "Falha na recuperação do PDF." }, 404);
	return new Response(object.body, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `attachment; filename="equanime-${id}.pdf"`,
		},
	});
});
