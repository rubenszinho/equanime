import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import sample from "./fixtures/lattes-sample.xml?raw";
import { decodeLattes, parseLattesXml } from "../src/lattes";
import { evaluateReviewer } from "../src/rules";
import { fixtureCurriculum, under } from "../src/collector";
import { renderReport } from "../src/pdf";
import { latin1 } from "./helpers";


const input = { name: "Carlos Pereira", lattesUrl: "http://lattes.cnpq.br/3333333333333333", consultedAt: "2026-10-30T12:00:00.000Z", source: "upload" as const };

describe("Lattes XML", () => {
	it("decodes ISO-8859-1 and ZIP exports", () => {
		expect(decodeLattes(latin1(sample))).toContain("Detecção de vieses");
		expect(decodeLattes(zipSync({ "curriculo.xml": latin1(sample) }))).toContain("São Carlos");
	});

	it("reads identity, publications, research projects, advising and training", () => {
		const cv = parseLattesXml(decodeLattes(latin1(sample)), input);
		expect(cv.lattes_id).toBe("3333333333333333");
		expect(cv.detected_name).toBe("Carlos Augusto Pereira");
		expect(cv.aliases).toEqual(["PEREIRA, C. A.", "Pereira, Carlos"]);
		expect(cv.lattes_updated_at).toBe("2026-08-15");
		expect(cv.publications).toHaveLength(2);
		expect(cv.publications[0]).toMatchObject({ title: "Detecção de vieses em decisões automatizadas", year: 2025, author_ids: ["3333333333333333", "1111111111111111"] });
		// Extension projects are not research projects.
		expect(cv.projects.map((item) => item.title)).toEqual(["Aprendizado de máquina para gestão pública"]);
		expect(cv.projects[0]).toMatchObject({ period: "2022–atual", institution: "Instituto de Ciências Matemáticas e de Computação" });
		expect(cv.advising).toHaveLength(2);
		expect(cv.advising.find((item) => item.ongoing)).toMatchObject({ advisee_name: "Rafael Costa", level: "doutorado" });
		expect(cv.training?.find((item) => item.level === "doutorado")).toMatchObject({ advisor_id: "2222222222222222", year: 2023 });
	});

	it("rejects files that are not a Lattes CV", () => {
		expect(() => parseLattesXml("<html></html>", input)).toThrow(/CURRICULO-VITAE/);
	});

	it("matches by Lattes ID and finds the advisor in the reviewer's own training", async () => {
		const reviewer = parseLattesXml(decodeLattes(latin1(sample)), input);
		const candidate = fixtureCurriculum({ name: "João Silva Neto", lattesId: "1111111111111111", lattesUrl: "http://lattes.cnpq.br/1111111111111111" });
		// The advisor's CV says nothing about Carlos; his own CV names her.
		const advisor = fixtureCurriculum({ name: "Maria Souza", lattesId: "2222222222222222", lattesUrl: "http://lattes.cnpq.br/2222222222222222" });
		const result = await evaluateReviewer({ candidate, reviewer, advisor: { ...advisor, advising: [] }, analyzedAt: "2026-10-30T00:00:00.000Z" });
		expect(result.status).toBe("potential_conflict");
		expect(result.checks.coauthorship.evidence[0]?.confidence).toBe("high");
		expect(result.checks.joint_research_projects.detected).toBe(true);
		expect(result.checks.recent_advisor_relationship.evidence[0]).toMatchObject({ orientation_type: "Doutorado", year_or_period: "2019–2023" });
	});
});

describe("plumbing", () => {
	it("joins URLs under a base path", () => {
		expect(under("https://brad-gateway.rubrion.ai/openai/v1/Acme", "chat/completions").href).toBe("https://brad-gateway.rubrion.ai/openai/v1/Acme/chat/completions");
		expect(under("https://collector.example/", "v1/collections").href).toBe("https://collector.example/v1/collections");
	});

	it("keeps accents in the PDF and survives characters outside the font", async () => {
		const bytes = await renderReport({
			analysisId: "test",
			type: "selection",
			workTitle: null,
			candidate: { name: "Conceição Araújo 王", lattesUrl: "http://lattes.cnpq.br/1111111111111111" },
			advisor: null,
			reviewers: [],
			limitations: ["Currículo de Inês recuperado de forma incompleta."],
			consultedAt: "2026-10-30T12:00:00.000Z",
		});
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
		expect(bytes.length).toBeGreaterThan(5_000);
	});
});
