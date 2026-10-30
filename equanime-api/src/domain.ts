export const ANALYSIS_STATUSES = [
	"pending",
	"collecting_lattes",
	"analyzing",
	"generating_report",
	"completed",
	"completed_with_warnings",
	"failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const RESULT_STATUSES = [
	"no_conflict_identified",
	"potential_conflict",
	"inconclusive",
] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const RESULT_LABELS = {
	no_conflict_identified: "SEM CONFLITO IDENTIFICADO",
	potential_conflict: "POSSÍVEL CONFLITO IDENTIFICADO",
	inconclusive: "ANÁLISE INCONCLUSIVA",
} as const;

export type ParticipantKind = "candidate" | "advisor" | "reviewer";
export type ReviewerRole = "titular" | "suplente";
// needs_upload: no automatic source could read the CV (captcha, no institutional access);
// the user can send the Lattes XML and reprocess.
export type CollectionStatus = "pending" | "complete" | "partial" | "failed" | "needs_upload";
export type CurriculumSource = "fixture" | "upload" | "institutional_xml";
export type AnalysisType = "academic" | "selection";

export type CurriculumWarning = { code: string; message: string };

export type PublicationRecord = {
	title: string;
	year: number | null;
	authors: string[];
	// Lattes IDs of the authors who have one, when the source carries them (XML does).
	author_ids?: string[];
	source_record: string;
};

export type ProjectRecord = {
	title: string;
	period: string | null;
	institution: string | null;
	participants: string[];
	participant_ids?: string[];
	source_record: string;
};

export type AdvisingRecord = {
	advisee_name: string;
	advisee_id?: string | null;
	level: string;
	year: number | null;
	period: string | null;
	ongoing?: boolean;
	institution: string | null;
	source_record: string;
};

// The person's own degrees, with who advised them: lets the advisor rule read the reviewer's CV too.
export type TrainingRecord = {
	level: string;
	advisor_name: string | null;
	advisor_id: string | null;
	year: number | null;
	period: string | null;
	ongoing: boolean;
	institution: string | null;
	source_record: string;
};

export type Curriculum = {
	requested_name: string;
	detected_name: string | null;
	lattes_id: string;
	lattes_url: string;
	consulted_at: string | null;
	source?: CurriculumSource;
	// Names the person signs with (NOME-EM-CITACOES-BIBLIOGRAFICAS).
	aliases?: string[];
	lattes_updated_at?: string | null;
	collection_status: CollectionStatus;
	error_type: string | null;
	error_message: string | null;
	warnings: CurriculumWarning[];
	publications: PublicationRecord[];
	projects: ProjectRecord[];
	advising: AdvisingRecord[];
	training?: TrainingRecord[];
};

export type Evidence = {
	rule: "coauthorship" | "recent_advisor_relationship" | "joint_research_projects";
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
	structured_record: unknown;
};

export type RuleCheck = {
	detected: boolean;
	inconclusive: boolean;
	result: string;
	evidence: Evidence[];
};

export type AdvisorCheck = RuleCheck & { applicable: boolean };

export type ReviewerChecks = {
	coauthorship: RuleCheck;
	recent_advisor_relationship: AdvisorCheck;
	joint_research_projects: RuleCheck;
};

export type ParticipantRow = {
	id: string;
	analysis_id: string;
	kind: ParticipantKind;
	reviewer_role: ReviewerRole | null;
	requested_name: string;
	detected_name: string | null;
	lattes_url: string;
	lattes_id: string;
	collection_status: CollectionStatus;
	collection_error: string | null;
	consulted_at: string | null;
	snapshot_key: string | null;
	upload_id: string | null;
	warnings: CurriculumWarning[];
};

export type AnalysisRow = {
	id: string;
	idempotency_key: string | null;
	payload_hash: string;
	type: AnalysisType;
	status: AnalysisStatus;
	message: string;
	work_title: string | null;
	actor: string;
	assistant_summary: string | null;
	summary_json: string | null;
	limitations: string[];
	report_key: string | null;
	workflow_instance_id: string | null;
	error_message: string | null;
	timings: Record<string, number>;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
};
