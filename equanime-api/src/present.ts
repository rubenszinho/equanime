import { AnalysisSchema } from "./schemas";
import type { ParticipantRow, ReviewerChecks, ResultStatus, ReviewerRole } from "./domain";
import { RESULT_LABELS } from "./domain";
import { getAnalysis, listParticipants, listResults } from "./repository";
import { envString } from "./settings";

const TERMINAL = new Set(["completed", "completed_with_warnings", "failed"]);

function person(participant: ParticipantRow) {
	return {
		name: participant.requested_name,
		lattes_url: participant.lattes_url,
		collection_status: participant.collection_status,
		collection_message: participant.collection_error,
	};
}

export async function presentAnalysis(env: CloudflareBindings, id: string) {
	const analysis = await getAnalysis(env.DB, id);
	if (!analysis) return null;
	const participants = await listParticipants(env.DB, id);
	const results = await listResults(env.DB, id);
	const candidate = participants.find((item) => item.kind === "candidate");
	const advisor = participants.find((item) => item.kind === "advisor") ?? null;
	const reviewers = participants.filter((item) => item.kind === "reviewer").map((participant) => {
		const result = results.find((item) => item.participant_id === participant.id);
		const checks = result ? JSON.parse(result.checks_json) as ReviewerChecks : emptyChecks(analysis.type === "academic");
		return {
			reviewer: {
				name: participant.requested_name,
				detected_name: participant.detected_name,
				role: (participant.reviewer_role ?? "titular") as ReviewerRole,
				lattes_url: participant.lattes_url,
				collection_status: participant.collection_status,
				collection_message: participant.collection_error,
			},
			status: (result?.status ?? "inconclusive") as ResultStatus,
			status_label: (result?.status_label ?? "ANÁLISE INCONCLUSIVA") as (typeof RESULT_LABELS)[ResultStatus],
			checks,
		};
	});
	const terminal = TERMINAL.has(analysis.status);
	const web = envString(env, "WEB_URL").replace(/\/$/, "");
	return AnalysisSchema.parse({
		analysis_id: analysis.id,
		type: analysis.type,
		status: analysis.status,
		message: analysis.message,
		assistant_summary: analysis.assistant_summary,
		candidate: candidate ? person(candidate) : { name: "", lattes_url: "", collection_status: "failed", collection_message: null },
		advisor: advisor ? person(advisor) : null,
		work_title: analysis.work_title,
		summary: analysis.summary_json ? JSON.parse(analysis.summary_json) : null,
		reviewers: terminal ? reviewers : [],
		limitations: analysis.limitations,
		needs_upload: terminal && participants.some((item) => item.collection_status === "needs_upload"),
		web_url: web ? `${web}/analises/${analysis.id}` : null,
		report_url: analysis.report_key ? `/analises/${analysis.id}/relatorio.pdf` : null,
		created_at: analysis.created_at,
		updated_at: analysis.updated_at,
	});
}

function emptyChecks(academic: boolean): ReviewerChecks {
	const pending = { detected: false, inconclusive: true, result: "Ainda não analisado.", evidence: [] };
	return {
		coauthorship: pending,
		recent_advisor_relationship: { ...pending, applicable: academic, result: academic ? pending.result : "Não aplicável: banca sem orientador." },
		joint_research_projects: pending,
	};
}
