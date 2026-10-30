import type { Curriculum, ParticipantRow, ReviewerChecks } from "./domain";
import { RESULT_LABELS } from "./domain";
import { blankCurriculum, collectorMode, providerFor, type CollectionInput } from "./collector";
import { LattesParseError, decodeLattes, parseLattesXml } from "./lattes";
import { resolveAmbiguousIdentity } from "./llm";
import { renderReport } from "./pdf";
import { logError, logInfo } from "./log";
import { matchNames } from "./normalize";
import { completeAnalysis, getUpload, listParticipants, replaceResults, saveCollection, updateStatus } from "./repository";
import { evaluateReviewer, resultLabel } from "./rules";

// The analysis runs as named steps. In a Workflow each step is durable and retried on
// its own; in tests and the inline mode the same code runs straight through.
export type Runner = {
	do<T>(name: string, fn: () => Promise<T>): Promise<T>;
	sleep(name: string, ms: number): Promise<void>;
};

export const direct: Runner = {
	do: (_name, fn) => fn(),
	sleep: async () => {},
};

// The collector answers within seconds when CNPq's extractor is up; give it two minutes.
const POLLS = 12;
const POLL_MS = 10_000;

function messageFor(status: string, reviewerCount: number, hasAdvisor: boolean): string {
	if (status === "collecting_lattes") {
		const advisor = hasAdvisor ? ", do orientador" : "";
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

export async function runAnalysis(env: CloudflareBindings, analysisId: string, run: Runner = direct): Promise<void> {
	const started = Date.now();
	try {
		const participants = await run.do("load", () => listParticipants(env.DB, analysisId));
		const reviewers = participants.filter((item) => item.kind === "reviewer");
		const hasAdvisor = participants.some((item) => item.kind === "advisor");
		await run.do("status:collecting", async () => {
			await updateStatus(env.DB, analysisId, "collecting_lattes", messageFor("collecting_lattes", reviewers.length, hasAdvisor), new Date().toISOString());
			logInfo("analysis_status", { analysis_id: analysisId, status: "collecting_lattes", curricula_requested: participants.length });
		});
		const collectionStarted = Date.now();
		for (const participant of participants) await collectParticipant(env, participant, run);
		const collectionMs = Date.now() - collectionStarted;

		const analysisStarted = Date.now();
		const outcome = await run.do("analyze-and-report", async () => {
			await updateStatus(env.DB, analysisId, "analyzing", messageFor("analyzing", reviewers.length, hasAdvisor), new Date().toISOString());
			const evaluated = await evaluateStored(env, analysisId);
			const analysisMs = Date.now() - analysisStarted;
			await updateStatus(env.DB, analysisId, "generating_report", messageFor("generating_report", reviewers.length, hasAdvisor), new Date().toISOString());
			const reportStarted = Date.now();
			const reportKey = await writeReport(env, analysisId, evaluated);
			const { summary, limitations, assistantSummary, failedCollections, degraded, type } = evaluated;
			return { summary, limitations, assistantSummary, failedCollections, degraded, type, reportKey, analysisMs, reportMs: Date.now() - reportStarted };
		});

		await run.do("complete", async () => {
			const status = outcome.degraded ? "completed_with_warnings" : "completed";
			await completeAnalysis(env.DB, {
				id: analysisId,
				status,
				message: status === "completed" ? "Análise concluída." : "Análise concluída com ressalvas.",
				summaryJson: JSON.stringify(outcome.summary),
				assistantSummary: outcome.assistantSummary,
				limitations: outcome.limitations,
				reportKey: outcome.reportKey,
				timings: { collection_ms: collectionMs, analysis_ms: outcome.analysisMs, report_ms: outcome.reportMs, total_ms: Date.now() - started },
				at: new Date().toISOString(),
			});
			logInfo("analysis_completed", {
				analysis_id: analysisId,
				status,
				type: outcome.type,
				curricula_requested: participants.length,
				curricula_recovered: participants.length - outcome.failedCollections,
				collection_ms: collectionMs,
				analysis_ms: outcome.analysisMs,
				conflicts: outcome.summary.potential_conflict,
				warnings: outcome.limitations.length,
				rules: ["coauthorship", "recent_advisor_relationship", "joint_research_projects"],
				total_ms: Date.now() - started,
			});
		});
	} catch (error) {
		// Reached only after a step has spent its retries.
		const message = error instanceof Error ? error.message : "Falha inesperada.";
		logError("analysis_failed", { analysis_id: analysisId, error: message, total_ms: Date.now() - started });
		await run.do("fail", async () => {
			const reviewers = (await listParticipants(env.DB, analysisId)).filter((item) => item.kind === "reviewer").length;
			await completeAnalysis(env.DB, {
				id: analysisId,
				status: "failed",
				message: "A análise falhou antes de produzir um resultado verificável.",
				summaryJson: JSON.stringify({ reviewers_analyzed: reviewers, without_identified_conflict: 0, potential_conflict: 0, inconclusive: reviewers }),
				assistantSummary: "A análise falhou. Nenhuma ausência de conflito foi presumida.",
				limitations: ["A análise falhou por um erro interno; tente novamente. Nenhuma ausência de conflito foi presumida."],
				reportKey: null,
				timings: { total_ms: Date.now() - started },
				at: new Date().toISOString(),
				error: message,
			});
		});
	}
}

async function collectParticipant(env: CloudflareBindings, participant: ParticipantRow, run: Runner): Promise<void> {
	const input: CollectionInput = { name: participant.requested_name, lattesUrl: participant.lattes_url, lattesId: participant.lattes_id };
	const step = `collect:${participant.id}`;
	// Steps store the CV themselves and return a flag: a parsed CV can outgrow a step's output limit.
	const save = async (curriculum: Curriculum) => {
		const checked = withNameCheck(curriculum);
		const key = `analyses/${participant.analysis_id}/curricula/${participant.id}.json`;
		await env.EVIDENCE.put(key, JSON.stringify(checked), { httpMetadata: { contentType: "application/json" } });
		await saveCollection(env.DB, participant.id, checked.collection_status, checked.detected_name, checked.consulted_at, key, checked.warnings, checked.error_message);
		return true;
	};

	if (participant.upload_id) {
		await run.do(`${step}:upload`, async () => save(await fromUpload(env, participant, input)));
		return;
	}
	if (collectorMode(env) === "upload") {
		await run.do(`${step}:save`, () => save(needsUpload(input, "no_automatic_source", "Nenhuma fonte automática do Lattes está configurada. Envie o XML do currículo.")));
		return;
	}
	// A collector that is down or refuses must not fail the analysis: the person is marked for upload.
	const submitted = await run.do(`${step}:submit`, async () => {
		try {
			return { jobId: (await providerFor(env)!.submit(input)).jobId };
		} catch (error) {
			return { error: error instanceof Error ? error.message : "collector_unavailable" };
		}
	});
	if ("error" in submitted) {
		logError("collector_submit_failed", { analysis_id: participant.analysis_id, participant_id: participant.id, error: submitted.error });
		await run.do(`${step}:save`, () => save(needsUpload(input, "collector_unavailable", "O coletor automático do Lattes não respondeu. Envie o XML do currículo.")));
		return;
	}
	let done = false;
	for (let attempt = 0; attempt < POLLS && !done; attempt += 1) {
		if (attempt > 0) await run.sleep(`${step}:wait:${attempt}`, POLL_MS);
		done = await run.do(`${step}:poll:${attempt}`, async () => {
			let result;
			try {
				result = await providerFor(env)!.status(submitted.jobId);
			} catch (error) {
				logError("collector_status_failed", { analysis_id: participant.analysis_id, participant_id: participant.id, error: error instanceof Error ? error.message : "unknown" });
				return false;
			}
			if (!result.done) return false;
			if ("curriculum" in result) return save(result.curriculum);
			if ("xml" in result) return save(parsed(result.xml, input, "institutional_xml"));
			return save(failedCollection(input, result.error.type, result.error.message));
		});
	}
	if (!done) await run.do(`${step}:save`, () => save(needsUpload(input, "collector_timeout", "A coleta automática do Lattes não terminou a tempo. Envie o XML do currículo.")));
}

async function fromUpload(env: CloudflareBindings, participant: ParticipantRow, input: CollectionInput): Promise<Curriculum> {
	const upload = await getUpload(env.DB, participant.upload_id!);
	const object = upload ? await env.EVIDENCE.get(upload.object_key) : null;
	if (!upload || !object) return needsUpload(input, "upload_missing", "O arquivo enviado não está mais disponível. Envie o XML novamente.");
	const curriculum = parsed(decodeLattes(new Uint8Array(await object.arrayBuffer())), input, "upload");
	return { ...curriculum, consulted_at: upload.created_at };
}

function parsed(xml: string, input: CollectionInput, source: Curriculum["source"]): Curriculum {
	try {
		return parseLattesXml(xml, { name: input.name, lattesUrl: input.lattesUrl, consultedAt: new Date().toISOString(), source });
	} catch (error) {
		const message = error instanceof LattesParseError ? error.message : "O XML do currículo não pôde ser lido.";
		return failedCollection(input, "unreadable_curriculum", message);
	}
}

// Captcha, missing institutional access or a collector outage: the user can still send the XML.
const UPLOADABLE = new Set(["captcha_required", "not_authorized", "temporary_unavailable", "collector_unavailable", "not_found"]);

function failedCollection(input: CollectionInput, type: string, message: string): Curriculum {
	return UPLOADABLE.has(type)
		? needsUpload(input, type, message)
		: blankCurriculum(input, "failed", { detected_name: null, error_type: type, error_message: message, warnings: [{ code: type, message }] });
}

function needsUpload(input: CollectionInput, type: string, message: string): Curriculum {
	const text = `${input.name}: ${message}`;
	return blankCurriculum(input, "needs_upload", { detected_name: null, error_type: type, error_message: message, warnings: [{ code: type, message: text }] });
}

// Issue §18: a name on the CV that differs from the one given is reported, not silently accepted.
function withNameCheck(curriculum: Curriculum): Curriculum {
	const detected = curriculum.detected_name;
	if (!detected || curriculum.warnings.some((item) => item.code === "name_mismatch")) return curriculum;
	if (matchNames(curriculum.requested_name, detected).match) return curriculum;
	if ((curriculum.aliases ?? []).some((alias) => matchNames(curriculum.requested_name, alias).match)) return curriculum;
	return {
		...curriculum,
		warnings: [...curriculum.warnings, {
			code: "name_mismatch",
			message: `Nome informado (${curriculum.requested_name}) diferente do nome no currículo (${detected}).`,
		}],
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
	const unread = (cv: Curriculum | null) => cv !== null && (cv.collection_status === "failed" || cv.collection_status === "needs_upload");
	let failedCollections = [candidateCv, advisorCv].filter(unread).length;
	let degraded = candidateCv.collection_status !== "complete" || Boolean(advisor && advisorCv?.collection_status !== "complete");
	const results = [];
	for (const reviewer of reviewers) {
		if (!reviewer.snapshot_key) throw new Error(`Avaliador sem coleta: ${reviewer.requested_name}`);
		const reviewerCv = await readSnapshot(env, reviewer.snapshot_key);
		if (unread(reviewerCv)) failedCollections += 1;
		if (reviewerCv.collection_status !== "complete" || reviewerCv.warnings.length > 0) degraded = true;
		const evaluated = await evaluateReviewer({
			candidate: candidateCv,
			reviewer: reviewerCv,
			advisor: advisorCv,
			analyzedAt: new Date().toISOString(),
			resolveIdentity: (left, right) => resolveAmbiguousIdentity(env, analysisId, left, right),
		});
		for (const limitation of evaluated.limitations) limitations.add(limitation);
		for (const warning of reviewerCv.warnings) limitations.add(warning.message);
		results.push({ reviewer, checks: evaluated.checks, status: evaluated.status });
	}
	for (const warning of [...candidateCv.warnings, ...(advisorCv?.warnings ?? [])]) limitations.add(warning.message);
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
	const needsUploads = [candidateCv, advisorCv].some((cv) => cv?.collection_status === "needs_upload");
	return {
		summary,
		limitations: [...limitations],
		assistantSummary: assistantSummary(candidate.requested_name, summary, results, needsUploads),
		failedCollections,
		degraded,
		type: analysis?.type ?? "selection",
		workTitle: analysis?.work_title ?? null,
		candidate,
		advisor,
		results,
	};
}

const RULE_NAMES = {
	coauthorship: "coautoria",
	recent_advisor_relationship: "orientação recente pelo orientador",
	joint_research_projects: "projeto de pesquisa conjunto",
} as const;

// Issue §16: a summary the assistant can repeat without rebuilding the analysis.
function assistantSummary(
	candidate: string,
	summary: { reviewers_analyzed: number; without_identified_conflict: number; potential_conflict: number; inconclusive: number },
	results: Array<{ reviewer: ParticipantRow; checks: ReviewerChecks; status: string }>,
	candidateNeedsUpload: boolean,
): string {
	const lines = [
		"Análise concluída.",
		`Candidato: ${candidate}.`,
		`Foram analisados ${summary.reviewers_analyzed} membros da banca.`,
		`${summary.without_identified_conflict} sem conflito identificado.`,
	];
	for (const item of results.filter((result) => result.status === "potential_conflict")) {
		const rules = (Object.keys(RULE_NAMES) as Array<keyof typeof RULE_NAMES>).filter((rule) => item.checks[rule].detected).map((rule) => RULE_NAMES[rule]);
		lines.push(`${item.reviewer.requested_name}: possível conflito (${rules.join(", ")}).`);
	}
	for (const item of results.filter((result) => result.status === "inconclusive")) {
		lines.push(`${item.reviewer.requested_name}: análise inconclusiva (currículo não recuperado integralmente).`);
	}
	if (candidateNeedsUpload) lines.push("O currículo do candidato ou do orientador não pôde ser lido automaticamente; envie o XML na página da análise e reprocesse.");
	lines.push("O relatório completo está disponível em PDF.", "O resultado reflete somente as fontes consultadas e deve ser conferido por uma pessoa.");
	return lines.join(" ");
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
		analysisId,
		type: outcome.type,
		workTitle: outcome.workTitle,
		candidate: { name: outcome.candidate.requested_name, lattesUrl: outcome.candidate.lattes_url },
		advisor: outcome.advisor ? { name: outcome.advisor.requested_name, lattesUrl: outcome.advisor.lattes_url } : null,
		reviewers: outcome.results.map((item) => ({
			name: item.reviewer.requested_name,
			lattesUrl: item.reviewer.lattes_url,
			role: item.reviewer.reviewer_role ?? "titular",
			checks: item.checks,
			status: item.status,
			conclusion: RESULT_LABELS[item.status],
		})),
		limitations: outcome.limitations,
		consultedAt: new Date().toISOString(),
	});
	const key = `analyses/${analysisId}/relatorio.pdf`;
	await env.EVIDENCE.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
	return key;
}
