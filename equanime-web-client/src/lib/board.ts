import { form } from "../data/copy";

export type PersonInput = { name: string; lattes_url: string };
export type ReviewerInput = PersonInput & { role: "titular" | "suplente" };
export type BoardInput = {
	candidate: PersonInput;
	advisor?: PersonInput;
	work_title?: string;
	reviewers: ReviewerInput[];
};

export type ResultStatus = "no_conflict_identified" | "potential_conflict" | "inconclusive";
export type CollectionStatus = "pending" | "complete" | "partial" | "failed" | "needs_upload";

export type Participant = PersonInput & { collection_status: CollectionStatus; collection_message: string | null };

export type Evidence = {
	rule: string;
	people: string[];
	record: string;
	year_or_period: string | null;
	source_curriculum: string;
	consulted_at: string | null;
	publication?: string;
	authors?: string[];
	project?: string;
	institution?: string | null;
	orientation_type?: string;
	confidence: "high" | "medium";
};

export type RuleCheck = { detected: boolean; inconclusive: boolean; result: string; evidence: Evidence[]; applicable?: boolean };

export type AnalysisResponse = {
	analysis_id: string;
	type: "academic" | "selection";
	status: string;
	message: string;
	assistant_summary: string | null;
	candidate: Participant;
	advisor: Participant | null;
	work_title: string | null;
	summary: { reviewers_analyzed: number; without_identified_conflict: number; potential_conflict: number; inconclusive: number } | null;
	reviewers: Array<{
		reviewer: Participant & { detected_name: string | null; role: "titular" | "suplente" };
		status: ResultStatus;
		status_label: string;
		checks: { coauthorship: RuleCheck; recent_advisor_relationship: RuleCheck; joint_research_projects: RuleCheck };
	}>;
	limitations: string[];
	needs_upload: boolean;
	report_url: string | null;
	created_at: string;
};

// Same hosts the API accepts, with the 16-digit Lattes ID.
const lattesPattern = /^https?:\/\/(lattes|buscatextual|wwws)\.cnpq\.br\/.*[0-9]{16}/i;

export const lattesId = (url: string) => url.match(/[0-9]{16}/)?.[0] ?? null;

export type FieldErrors = Record<string, string>;

export function validateBoard(input: BoardInput): FieldErrors {
	const errors: FieldErrors = {};
	const e = form.errors;
	if (input.candidate.name.trim().length < 3) errors["candidate.name"] = e.candidateName;
	if (!lattesPattern.test(input.candidate.lattes_url.trim())) errors["candidate.lattes"] = e.candidateLattes;
	if (input.advisor) {
		if (input.advisor.name.trim().length < 3) errors["advisor.name"] = e.advisorName;
		if (!lattesPattern.test(input.advisor.lattes_url.trim())) errors["advisor.lattes"] = e.advisorLattes;
	}
	if (input.reviewers.length === 0) errors.reviewers = e.reviewers;
	const seen = new Set<string>();
	input.reviewers.forEach((reviewer, index) => {
		if (reviewer.name.trim().length < 3 || !lattesPattern.test(reviewer.lattes_url.trim())) {
			errors[`reviewers.${index}`] = e.reviewer(index + 1);
			return;
		}
		const id = lattesId(reviewer.lattes_url);
		if (id && id === lattesId(input.candidate.lattes_url)) errors[`reviewers.${index}`] = e.self;
		else if (id && seen.has(id)) errors[`reviewers.${index}`] = e.duplicate;
		if (id) seen.add(id);
	});
	return errors;
}
