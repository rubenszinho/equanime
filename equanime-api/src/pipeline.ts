import type { Curriculum, ParticipantRow, ReviewerChecks } from "./domain";
import { RESULT_LABELS } from "./domain";
import { providerFor } from "./collector";
import { resolveAmbiguousIdentity } from "./llm";
import { renderReport } from "./pdf";
import { logError, logInfo } from "./log";
import { completeAnalysis, listParticipants, replaceResults, saveCollection, updateStatus } from "./repository";
import { evaluateReviewer, resultLabel } from "./rules";

function messageFor(status: string, reviewerCount: number, hasAdvisor: boolean): string {
	if (status === "collecting_lattes") {
		const advisor = hasAdvisor ? " e do orientador" : "";
		return `Coletando os Currículos Lattes do candidato${advisor} e de ${reviewerCount} avaliador(es).`;
	}
	if (status === "analyzing") return "Aplicando as regras de coautoria, orientação recente e projetos de pesquisa.";
	if (status === "generating_report") return "Gerando o relatório em PDF.";
	return "Processando a análise.";
}

async function readSnapshot(env: CloudflareBindings, key: string): Promise<Curriculum> {
	const object = await env.EVIDENCE.get(key);
	if (!object) throw new Error("snapshot_missing");
	return object.json<Curriculum>();
}

export async function runAnalysis(env: CloudflareBindings, analysisId: string): Promise<void> {
	const started = Date.now();
	const participants = await listParticipants(env.DB, analysisId);
	const reviewers = participants.filter((item) => item.kind === "reviewer");
	const hasAdvisor = participants.some((item) => item.kind === "advisor");
	const collectionStarted = Date.now();
	await updateStatus(env.DB, analysisId, "collecting_lattes", messageFor("collecting_lattes", reviewers.length, hasAdvisor), new Date().toISOString());
	logInfo("analysis_status", { analysis_id: analysisId, status: "collecting_lattes", curricula_requested: participants.length });
	try {
		for (const participant of participants) await collectParticipant(env, participant);
		const collectionMs = Date.now() - collectionStarted;
		await updateStatus(env.DB, analysisId, "analyzing", messageFor("analyzing", reviewers.length, hasAdvisor), new Date().toISOString());
		const analysisStarted = Date.now();
		const outcome = await evaluateStored(env, analysisId);
		const analysisMs = Date.now() - analysisStarted;
		await updateStatus(env.DB, analysisId, "generating_report", messageFor("generating_report", reviewers.length, hasAdvisor), new Date().toISOString());
		const reportStarted = Date.now();
		const reportKey = await writeReport(env, analysisId, outcome);
		const reportMs = Date.now() - reportStarted;
		const status = outcome.degraded ? "completed_with_warnings" : "completed";
		const at = new Date().toISOString();
		await completeAnalysis(env.DB, {
			id: analysisId,
			status,
			message: status === "completed" ? "Análise concluída." : "Análise concluída com ressalvas.",
			summaryJson: JSON.stringify(outcome.summary),
			assistantSummary: outcome.assistantSummary,
			limitations: outcome.limitations,
			reportKey,
			timings: { collection_ms: collectionMs, analysis_ms: analysisMs, report_ms: reportMs, total_ms: Date.now() - started },
			at,
		});
		logInfo("analysis_completed", {
			analysis_id: analysisId,
			status,
			type: outcome.type,
			curricula_requested: participants.length,
			curricula_recovered: participants.length - outcome.failedCollections,
			conflicts: outcome.summary.potential_conflict,
			warnings: outcome.limitations,
			rules: ["coauthorship", "recent_advisor_relationship", "joint_research_projects"],
			total_ms: Date.now() - started,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Falha inesperada.";
		logError("analysis_failed", { analysis_id: analysisId, error: message, total_ms: Date.now() - started });
		await completeAnalysis(env.DB, {
			id: analysisId,
			status: "failed",
			message: "A análise falhou antes de produzir um resultado verificável.",
			summaryJson: JSON.stringify({ reviewers_analyzed: reviewers.length, without_identified_conflict: 0, potential_conflict: 0, inconclusive: reviewers.length }),
			assistantSummary: "A análise falhou. Nenhuma ausência de conflito foi presumida.",
			limitations: [message],
			reportKey: null,
			timings: { total_ms: Date.now() - started },
			at: new Date().toISOString(),
			error: message,
		});
	}
}

async function collectParticipant(env: CloudflareBindings, participant: ParticipantRow): Promise<void> {
	const provider = providerFor(env);
	const submitted = await provider.submit({ name: participant.requested_name, lattesUrl: participant.lattes_url, lattesId: participant.lattes_id });
	let poll = await provider.status(submitted.jobId);
	for (let attempt = 0; attempt < 3 && !poll.done; attempt += 1) poll = await provider.status(submitted.jobId);
	const curriculum = poll.curriculum ?? failedCurriculum(participant, poll.error ?? "Falha na coleta.");
	const key = `analyses/${participant.analysis_id}/curricula/${participant.id}.json`;
	await env.EVIDENCE.put(key, JSON.stringify(curriculum), { httpMetadata: { contentType: "application/json" } });
	await saveCollection(env.DB, participant.id, curriculum.collection_status, curriculum.detected_name, curriculum.consulted_at, key, curriculum.warnings, curriculum.error_message);
}

function failedCurriculum(participant: ParticipantRow, message: string): Curriculum {
	return {
		requested_name: participant.requested_name,
		detected_name: null,
		lattes_id: participant.lattes_id,
		lattes_url: participant.lattes_url,
		consulted_at: new Date().toISOString(),
		collection_status: "failed",
		error_type: "collection_failed",
		error_message: message,
		warnings: [{ code: "collection_failed", message }],
		publications: [],
		projects: [],
		advising: [],
	};
}

async function evaluateStored(env: CloudflareBindings, analysisId: string) {
	const participants = await listParticipants(env.DB, analysisId);
	const candidate = participants.find((item) => item.kind === "candidate");
	const advisor = participants.find((item) => item.kind === "advisor") ?? null;
	const reviewers = participants.filter((item) => item.kind === "reviewer");
	if (!candidate?.snapshot_key) throw new Error("Candidato sem currículo coletado.");
	const candidateCv = await readSnapshot(env, candidate.snapshot_key);
	const advisorCv = advisor?.snapshot_key ? await readSnapshot(env, advisor.snapshot_key) : null;
	const limitations = new Set<string>();
	let failedCollections = 0;
	let degraded = candidateCv.collection_status !== "complete" || Boolean(advisor && advisorCv?.collection_status !== "complete");
	const results = [];
	for (const reviewer of reviewers) {
		if (!reviewer.snapshot_key) throw new Error(`Avaliador sem coleta: ${reviewer.requested_name}`);
		const reviewerCv = await readSnapshot(env, reviewer.snapshot_key);
		if (reviewerCv.collection_status === "failed") failedCollections += 1;
		if (reviewerCv.collection_status !== "complete" || reviewerCv.warnings.length > 0) degraded = true;
		const evaluated = await evaluateReviewer({
			candidate: candidateCv,
			reviewer: reviewerCv,
			advisor: advisorCv,
			analyzedAt: new Date().toISOString(),
			resolveIdentity: (left, right) => resolveAmbiguousIdentity(env, analysisId, left, right),
		});
		for (const limitation of evaluated.limitations) limitations.add(limitation);
		for (const warning of [...candidateCv.warnings, ...reviewerCv.warnings, ...(advisorCv?.warnings ?? [])]) limitations.add(warning.message);
		results.push({ reviewer, checks: evaluated.checks, status: evaluated.status });
	}
	if (candidateCv.collection_status === "failed") failedCollections += 1;
	if (candidateCv.warnings.length > 0 || (advisorCv?.warnings.length ?? 0) > 0) degraded = true;
	const summary = {
		reviewers_analyzed: results.length,
		without_identified_conflict: results.filter((item) => item.status === "no_conflict_identified").length,
		potential_conflict: results.filter((item) => item.status === "potential_conflict").length,
		inconclusive: results.filter((item) => item.status === "inconclusive").length,
	};
	await replaceResults(env.DB, analysisId, results.map((item) => ({
		id: crypto.randomUUID(),
		participantId: item.reviewer.id,
		status: item.status,
		statusLabel: resultLabel(item.status),
		checksJson: JSON.stringify(item.checks),
		evidence: evidenceOf(item.checks),
	})));
	const analysis = await env.DB.prepare("SELECT type, work_title FROM analyses WHERE id = ?").bind(analysisId).first<{ type: "academic" | "selection"; work_title: string | null }>();
	const assistantSummary = [
		"Análise concluída.",
		`Candidato: ${candidate.requested_name}.`,
		`Foram analisados ${summary.reviewers_analyzed} membros da banca.`,
		`${summary.without_identified_conflict} membros sem conflito identificado.`,
		`${summary.potential_conflict} membros com possível conflito.`,
		`${summary.inconclusive} membros com análise inconclusiva.`,
		"O relatório completo está disponível em PDF.",
		"O resultado reflete somente as fontes consultadas e deve ser conferido por uma pessoa.",
	].join(" ");
	return { summary, limitations: [...limitations], assistantSummary, failedCollections, degraded, type: analysis?.type ?? "selection", workTitle: analysis?.work_title ?? null, candidate, advisor, results };
}

function evidenceOf(checks: ReviewerChecks) {
	return [
		...checks.coauthorship.evidence,
		...checks.recent_advisor_relationship.evidence,
		...checks.joint_research_projects.evidence,
	].map((item) => ({ rule: item.rule, payload: item }));
}

async function writeReport(env: CloudflareBindings, analysisId: string, outcome: Awaited<ReturnType<typeof evaluateStored>>): Promise<string> {
	const bytes = await renderReport({
		type: outcome.type,
		workTitle: outcome.workTitle,
		candidate: { name: outcome.candidate.requested_name, lattesUrl: outcome.candidate.lattes_url },
		advisor: outcome.advisor ? { name: outcome.advisor.requested_name, lattesUrl: outcome.advisor.lattes_url } : null,
		reviewers: outcome.results.map((item) => ({
			name: item.reviewer.requested_name,
			role: item.reviewer.reviewer_role ?? "titular",
			checks: item.checks,
			conclusion: RESULT_LABELS[item.status],
		})),
		limitations: outcome.limitations,
		consultedAt: new Date().toISOString(),
	});
	const key = `analyses/${analysisId}/relatorio.pdf`;
	await env.EVIDENCE.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
	return key;
}
