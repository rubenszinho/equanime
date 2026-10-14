import { AnalysisSchema } from "./schemas";
import type { ReviewerChecks, ResultStatus, ReviewerRole } from "./domain";
import { RESULT_LABELS } from "./domain";
import { getAnalysis, listParticipants, listResults } from "./repository";

export async function presentAnalysis(db: D1Database, id: string) {
	const analysis = await getAnalysis(db, id);
	if (!analysis) return null;
	const participants = await listParticipants(db, id);
	const results = await listResults(db, id);
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
			},
			status: (result?.status ?? "inconclusive") as ResultStatus,
			status_label: (result?.status_label ?? "ANÁLISE INCONCLUSIVA") as (typeof RESULT_LABELS)[ResultStatus],
			checks,
		};
	});
	return AnalysisSchema.parse({
		analysis_id: analysis.id,
		type: analysis.type,
		status: analysis.status,
		message: analysis.message,
		assistant_summary: analysis.assistant_summary,
		candidate: { name: candidate?.requested_name ?? "", lattes_url: candidate?.lattes_url ?? "" },
		advisor: advisor ? { name: advisor.requested_name, lattes_url: advisor.lattes_url } : null,
		work_title: analysis.work_title,
		summary: analysis.summary_json ? JSON.parse(analysis.summary_json) : null,
		reviewers: analysis.status === "completed" || analysis.status === "completed_with_warnings" || analysis.status === "failed" ? reviewers : [],
		limitations: analysis.limitations,
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
