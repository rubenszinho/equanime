import { describe, expect, it } from "vitest";
import { matchNames, parseLattes } from "../src/normalize";
import { evaluateReviewer } from "../src/rules";
import { fixtureCurriculum } from "../src/collector";
import { renderReport } from "../src/pdf";

describe("name matching", () => {
	it("accepts initials and accents", () => {
		expect(matchNames("Ricardo Marcacini", "Ricardo M. Marcacini").match).toBe(true);
		expect(matchNames("Ricardo Marcacini", "R. M. Marcacini").match).toBe(true);
		expect(matchNames("João da Silva", "Joao Silva").match).toBe(true);
		expect(matchNames("Ana Santos", "Roberto Santos").match).toBe(false);
	});

	it("reads citation forms with the surname first", () => {
		expect(matchNames("MARCACINI, R. M.", "Ricardo Marcacini").match).toBe(true);
	});

	it("rejects invalid Lattes URLs", () => {
		expect(parseLattes("http://lattes.cnpq.br/1111111111111111").ok).toBe(true);
		expect(parseLattes("https://example.com/1111111111111111").ok).toBe(false);
		expect(parseLattes("https://evil-cnpq.br/1111111111111111").ok).toBe(false);
		expect(parseLattes("http://lattes.cnpq.br/perfil").ok).toBe(false);
	});
});

describe("conflict rules", () => {
	const at = "2026-10-14T00:00:00.000Z";
	const candidate = fixtureCurriculum({ name: "João da Silva", lattesId: "1111111111111111", lattesUrl: "http://lattes.cnpq.br/1111111111111111" });
	const advisor = fixtureCurriculum({ name: "Maria Souza", lattesId: "2222222222222222", lattesUrl: "http://lattes.cnpq.br/2222222222222222" });

	it("detects coauthorship, projects and recent advising", async () => {
		const carlos = await evaluateReviewer({ candidate, advisor, analyzedAt: at, reviewer: fixtureCurriculum({ name: "Carlos Pereira", lattesId: "3333333333333333", lattesUrl: "http://lattes.cnpq.br/3333333333333333" }) });
		const ana = await evaluateReviewer({ candidate, advisor, analyzedAt: at, reviewer: fixtureCurriculum({ name: "Ana Santos", lattesId: "4444444444444444", lattesUrl: "http://lattes.cnpq.br/4444444444444444" }) });
		const pedro = await evaluateReviewer({ candidate, advisor, analyzedAt: at, reviewer: fixtureCurriculum({ name: "Pedro Oliveira", lattesId: "5555555555555555", lattesUrl: "http://lattes.cnpq.br/5555555555555555" }) });
		expect(carlos.checks.coauthorship.detected).toBe(true);
		expect(carlos.checks.coauthorship.evidence[0]?.publication).toContain("Inteligência Artificial");
		expect(ana.checks.joint_research_projects.detected).toBe(true);
		expect(pedro.checks.recent_advisor_relationship.detected).toBe(true);
		expect(pedro.checks.recent_advisor_relationship.evidence[0]?.orientation_type).toBe("Doutorado");
	});

	it("does not apply the advisor rule without an advisor", async () => {
		const pedro = await evaluateReviewer({ candidate, advisor: null, analyzedAt: at, reviewer: fixtureCurriculum({ name: "Pedro Oliveira", lattesId: "5555555555555555", lattesUrl: "http://lattes.cnpq.br/5555555555555555" }) });
		expect(pedro.checks.recent_advisor_relationship.applicable).toBe(false);
		expect(pedro.status).toBe("no_conflict_identified");
	});

	it("keeps a failed curriculum inconclusive and survives LLM failure", async () => {
		const failed = await evaluateReviewer({
			candidate,
			advisor,
			analyzedAt: at,
			reviewer: fixtureCurriculum({ name: "X. Marcacini", lattesId: "0000000000000000", lattesUrl: "http://lattes.cnpq.br/0000000000000000" }),
			resolveIdentity: async () => {
				throw new Error("llm down");
			},
		});
		expect(failed.status).toBe("inconclusive");
	});
});

describe("pdf", () => {
	it("renders an academic report", async () => {
		const bytes = await renderReport({
			analysisId: "test",
			type: "academic",
			workTitle: "Tese",
			candidate: { name: "João da Silva", lattesUrl: "http://lattes.cnpq.br/1111111111111111" },
			advisor: { name: "Maria Souza", lattesUrl: "http://lattes.cnpq.br/2222222222222222" },
			reviewers: [],
			limitations: ["Ausência de publicações nos currículos consultados."],
			consultedAt: "2026-10-14",
		});
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
	});
});
