export type PersonInput = { name: string; lattes_url: string };
export type ReviewerInput = PersonInput & { role: "titular" | "suplente" };
export type BoardInput = {
	candidate: PersonInput;
	advisor?: PersonInput;
	work_title?: string;
	reviewers: ReviewerInput[];
};

export type AnalysisResponse = {
	analysis_id: string;
	type: "academic" | "selection";
	status: string;
	message: string;
	assistant_summary: string | null;
	candidate: PersonInput;
	advisor: PersonInput | null;
	work_title: string | null;
	summary: {
		reviewers_analyzed: number;
		without_identified_conflict: number;
		potential_conflict: number;
		inconclusive: number;
	} | null;
	reviewers: Array<{
		reviewer: { name: string; role: string; lattes_url: string; collection_status: string };
		status_label: string;
		checks: Record<string, { result: string; evidence: Array<{ record: string; year_or_period: string | null }> }>;
	}>;
	limitations: string[];
	report_url: string | null;
};

const lattesPattern = /^https?:\/\/(?:[a-z0-9-]+\.)*cnpq\.br\/.*[0-9]{16}/i;

export function validateBoard(input: BoardInput): string[] {
	const errors: string[] = [];
	if (input.candidate.name.trim().length < 3) errors.push("Informe o nome do candidato.");
	if (!lattesPattern.test(input.candidate.lattes_url)) errors.push("Informe o Currículo Lattes do candidato.");
	if (input.advisor && !lattesPattern.test(input.advisor.lattes_url)) errors.push("O Lattes do orientador é inválido.");
	if (input.reviewers.length === 0) errors.push("Informe ao menos um avaliador.");
	input.reviewers.forEach((reviewer, index) => {
		if (reviewer.name.trim().length < 3 || !lattesPattern.test(reviewer.lattes_url)) {
			errors.push(`Revise o nome e o Lattes do avaliador ${index + 1}.`);
		}
	});
	return errors;
}
