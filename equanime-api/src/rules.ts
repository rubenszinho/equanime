import type { Curriculum, Evidence, ReviewerChecks, ResultStatus } from "./domain";
import { RESULT_LABELS } from "./domain";
import { endYear, matchNames, titlesMatch } from "./normalize";

const ORIENTATION_LEVELS: Record<string, string> = {
	mestrado: "Mestrado",
	doutorado: "Doutorado",
	pos_doutorado: "Pós-doutorado",
	"pos-doutorado": "Pós-doutorado",
	posdoutorado: "Pós-doutorado",
};

export type IdentityResolver = (left: string, right: string) => Promise<boolean>;

function sourceOf(curriculum: Curriculum): string {
	return curriculum.detected_name
		? `${curriculum.detected_name} (${curriculum.lattes_url})`
		: curriculum.lattes_url;
}

function orientationLabel(level: string): string | null {
	const key = level.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s-]+/g, "_");
	return ORIENTATION_LEVELS[key] ?? null;
}

async function samePerson(resolver: IdentityResolver | undefined, left: string, right: string): Promise<boolean> {
	const match = matchNames(left, right);
	if (match.match) return true;
	if (!match.ambiguous || !resolver) return false;
	try {
		return await resolver(left, right);
	} catch {
		return false;
	}
}

// Every name the CV gives for its owner: the one asked for, the one on the CV, citation forms.
function namesOf(curriculum: Curriculum): string[] {
	return [...new Set([curriculum.detected_name, curriculum.requested_name, ...(curriculum.aliases ?? [])].filter((item): item is string => Boolean(item)))];
}

// A Lattes ID on the record settles identity; names are the fallback.
async function isPerson(resolver: IdentityResolver | undefined, name: string, id: string | null | undefined, person: Curriculum): Promise<boolean> {
	if (id && person.lattes_id) return id === person.lattes_id;
	for (const candidate of namesOf(person)) if (await samePerson(resolver, name, candidate)) return true;
	return false;
}

async function listsPerson(resolver: IdentityResolver | undefined, names: string[], ids: string[] | undefined, person: Curriculum): Promise<boolean> {
	if (ids?.includes(person.lattes_id)) return true;
	for (const name of names) {
		for (const candidate of namesOf(person)) if (await samePerson(resolver, name, candidate)) return true;
	}
	return false;
}

const unread = (curriculum: Curriculum) => curriculum.collection_status === "failed" || curriculum.collection_status === "needs_upload";

export async function evaluateReviewer(input: {
	candidate: Curriculum;
	reviewer: Curriculum;
	advisor: Curriculum | null;
	analyzedAt: string;
	resolveIdentity?: IdentityResolver;
}): Promise<{ status: ResultStatus; checks: ReviewerChecks; limitations: string[] }> {
	const limitations: string[] = [];
	const coauthorship = await evaluateCoauthorship(input.candidate, input.reviewer, input.resolveIdentity);
	const projects = await evaluateProjects(input.candidate, input.reviewer, input.resolveIdentity);
	const advising = input.advisor
		? await evaluateAdvising(input.advisor, input.reviewer, input.analyzedAt, input.resolveIdentity)
		: {
				applicable: false,
				detected: false,
				inconclusive: false,
				result: "Não aplicável: banca sem orientador.",
				evidence: [],
			};

	if (input.candidate.publications.length === 0 && input.reviewer.publications.length === 0) {
		limitations.push("Ausência de publicações nos currículos consultados.");
	}
	if (input.candidate.projects.length === 0 && input.reviewer.projects.length === 0) {
		limitations.push("Ausência de projetos de pesquisa nos currículos consultados.");
	}
	if (input.advisor && input.advisor.advising.length === 0 && input.advisor.collection_status === "complete") {
		limitations.push("Ausência de orientações no currículo do orientador.");
	}
	if (input.candidate.collection_status !== "complete") limitations.push("Currículo do candidato recuperado de forma incompleta ou indisponível.");
	if (input.reviewer.collection_status !== "complete") limitations.push(`Currículo de ${input.reviewer.requested_name} recuperado de forma incompleta ou indisponível.`);
	if (input.advisor && input.advisor.collection_status !== "complete") limitations.push("Currículo do orientador recuperado de forma incompleta ou indisponível.");

	const detected = coauthorship.detected || projects.detected || advising.detected;
	const inconclusive = !detected && (coauthorship.inconclusive || projects.inconclusive || advising.inconclusive);
	const status: ResultStatus = detected ? "potential_conflict" : inconclusive ? "inconclusive" : "no_conflict_identified";
	if (status === "no_conflict_identified") {
		limitations.push("O resultado indica apenas o que foi identificado nas fontes consultadas e não comprova ausência absoluta de conflito.");
	}
	return { status, checks: { coauthorship, recent_advisor_relationship: advising, joint_research_projects: projects }, limitations };
}

async function evaluateCoauthorship(candidate: Curriculum, reviewer: Curriculum, resolver?: IdentityResolver) {
	const evidence: Evidence[] = [];
	const unavailable = unread(candidate) || unread(reviewer);
	const partial = candidate.collection_status === "partial" || reviewer.collection_status === "partial";
	for (const publication of candidate.publications) {
		if (await listsPerson(resolver, publication.authors, publication.author_ids, reviewer)) {
			evidence.push(publicationEvidence(candidate, reviewer, publication, "high"));
		}
	}
	for (const publication of reviewer.publications) {
		if (await listsPerson(resolver, publication.authors, publication.author_ids, candidate)) {
			evidence.push(publicationEvidence(reviewer, candidate, publication, "high"));
		}
	}
	for (const left of candidate.publications) {
		for (const right of reviewer.publications) {
			if (titlesMatch(left.title, right.title) && left.year === right.year) {
				evidence.push(publicationEvidence(candidate, reviewer, left, "medium"));
			}
		}
	}
	const unique = dedupe(evidence);
	return finishCheck(unique, unavailable || (partial && unique.length === 0), "coautoria com o candidato");
}

async function evaluateProjects(candidate: Curriculum, reviewer: Curriculum, resolver?: IdentityResolver) {
	const evidence: Evidence[] = [];
	const unavailable = unread(candidate) || unread(reviewer);
	const partial = candidate.collection_status === "partial" || reviewer.collection_status === "partial";
	const reviewerName = reviewer.detected_name ?? reviewer.requested_name;
	const candidateName = candidate.detected_name ?? candidate.requested_name;
	for (const project of candidate.projects) {
		if (await listsPerson(resolver, project.participants, project.participant_ids, reviewer)) {
			evidence.push(projectEvidence(candidate, reviewerName, project));
		}
	}
	for (const project of reviewer.projects) {
		if (await listsPerson(resolver, project.participants, project.participant_ids, candidate)) {
			evidence.push(projectEvidence(reviewer, candidateName, project));
		}
	}
	for (const left of candidate.projects) {
		for (const right of reviewer.projects) {
			if (titlesMatch(left.title, right.title)) evidence.push(projectEvidence(candidate, reviewerName, left));
		}
	}
	return finishCheck(dedupe(evidence), unavailable || (partial && evidence.length === 0), "participação conjunta em projetos");
}

async function evaluateAdvising(advisor: Curriculum, reviewer: Curriculum, analyzedAt: string, resolver?: IdentityResolver) {
	const evidence: Evidence[] = [];
	const thisYear = new Date(analyzedAt).getUTCFullYear();
	const yearLimit = thisYear - 5;
	const advisorName = advisor.detected_name ?? advisor.requested_name;
	const reviewerName = reviewer.detected_name ?? reviewer.requested_name;
	let missingPeriod = false;
	const consider = (record: { level: string; year: number | null; period: string | null; ongoing?: boolean; institution: string | null; source_record: string }, source: Curriculum, confidence: "high" | "medium") => {
		const label = orientationLabel(record.level);
		if (!label) return;
		// Ongoing advising is current by definition.
		const year = record.ongoing ? thisYear : endYear(record.year, record.period);
		if (year === null) {
			missingPeriod = true;
			return;
		}
		if (year < yearLimit) return;
		evidence.push({
			rule: "recent_advisor_relationship",
			people: [advisorName, reviewerName],
			record: record.source_record,
			year_or_period: record.period ?? String(year),
			source_curriculum: sourceOf(source),
			consulted_at: source.consulted_at,
			orientation_type: label,
			institution: record.institution,
			confidence,
			structured_record: record,
		});
	};
	// The advisor's CV lists their advisees.
	if (!unread(advisor)) {
		for (const record of advisor.advising) {
			if (!(await isPerson(resolver, record.advisee_name, record.advisee_id, reviewer))) continue;
			const confidence = record.advisee_id || matchNames(record.advisee_name, reviewerName).confidence === "high" ? "high" : "medium";
			consider(record, advisor, confidence);
		}
	}
	// The reviewer's CV names who advised their degrees.
	if (!unread(reviewer)) {
		for (const record of reviewer.training ?? []) {
			if (!record.advisor_name && !record.advisor_id) continue;
			if (!(await isPerson(resolver, record.advisor_name ?? "", record.advisor_id, advisor))) continue;
			consider(record, reviewer, record.advisor_id ? "high" : "medium");
		}
	}
	const inconclusive = advisor.collection_status !== "complete" || (missingPeriod && evidence.length === 0);
	const base = finishCheck(dedupe(evidence), inconclusive, "relação recente com o orientador");
	return { ...base, applicable: true };
}

function finishCheck(evidence: Evidence[], inconclusive: boolean, label: string) {
	const detected = evidence.length > 0;
	const result = detected
		? `Possível conflito identificado em ${label}.`
		: inconclusive
			? `Análise inconclusiva para ${label}.`
			: `Sem conflito identificado nas fontes consultadas para ${label}.`;
	return { detected, inconclusive: inconclusive && !detected, result, evidence };
}

function publicationEvidence(source: Curriculum, other: Curriculum, publication: Curriculum["publications"][number], confidence: "high" | "medium"): Evidence {
	return {
		rule: "coauthorship",
		people: [source.requested_name, other.requested_name],
		record: publication.source_record,
		year_or_period: publication.year ? String(publication.year) : null,
		source_curriculum: sourceOf(source),
		consulted_at: source.consulted_at,
		publication: publication.title,
		authors: publication.authors,
		confidence,
		structured_record: publication,
	};
}

function projectEvidence(source: Curriculum, otherName: string, project: Curriculum["projects"][number]): Evidence {
	return {
		rule: "joint_research_projects",
		people: [source.requested_name, otherName],
		record: project.source_record,
		year_or_period: project.period,
		source_curriculum: sourceOf(source),
		consulted_at: source.consulted_at,
		project: project.title,
		institution: project.institution,
		confidence: "high",
		structured_record: project,
	};
}

function dedupe(evidence: Evidence[]): Evidence[] {
	const seen = new Set<string>();
	return evidence.filter((item) => {
		const key = `${item.rule}:${item.record}:${item.source_curriculum}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function resultLabel(status: ResultStatus): string {
	return RESULT_LABELS[status];
}
