import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runAnalysis } from "../src/pipeline";

const academic = {
	candidate: { name: "João da Silva", lattes_url: "http://lattes.cnpq.br/1111111111111111" },
	advisor: { name: "Maria Souza", lattes_url: "http://lattes.cnpq.br/2222222222222222" },
	work_title: "Métodos de Inteligência Artificial",
	reviewers: [
		{ name: "Carlos Pereira", lattes_url: "http://lattes.cnpq.br/3333333333333333", role: "titular" },
		{ name: "Ana Santos", lattes_url: "http://lattes.cnpq.br/4444444444444444", role: "titular" },
		{ name: "Pedro Oliveira", lattes_url: "http://lattes.cnpq.br/5555555555555555", role: "suplente" },
		{ name: "Clara Nunes", lattes_url: "http://lattes.cnpq.br/6666666666666666", role: "suplente" },
	],
};

async function post(body: unknown, headers: Record<string, string> = {}) {
	return SELF.fetch("https://equanime.test/analises", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

describe("analysis API", () => {
	it("publishes an LLM-oriented OpenAPI document", async () => {
		const response = await SELF.fetch("https://equanime.test/openapi.json");
		const spec = await response.json<{ paths: Record<string, unknown>; info: { description: string } }>();
		expect(spec.paths["/analises"]).toBeTruthy();
		expect(spec.paths["/analises/{analysis_id}"]).toBeTruthy();
		expect(spec.paths["/analises/{analysis_id}/relatorio.pdf"]).toBeTruthy();
		expect(spec.info.description).toContain("POST /analises");
	});

	it("runs the academic workflow body and returns evidence plus PDF", async () => {
		const createdResponse = await post(academic);
		expect(createdResponse.status).toBe(202);
		const created = await createdResponse.json<{ analysis_id: string; status: string; type: string }>();
		expect(created.status).toBe("pending");
		expect(created.type).toBe("academic");
		await runAnalysis(env, created.analysis_id);
		const result = await (await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}`)).json<{
			status: string;
			assistant_summary: string;
			summary: { potential_conflict: number; without_identified_conflict: number };
			reviewers: Array<{ status: string; checks: { coauthorship: { evidence: unknown[] } } }>;
			report_url: string;
		}>();
		expect(result.status).toBe("completed");
		expect(result.summary.potential_conflict).toBe(3);
		expect(result.summary.without_identified_conflict).toBe(1);
		expect(result.assistant_summary).toContain("João da Silva");
		expect(result.reviewers.some((reviewer) => reviewer.checks.coauthorship.evidence.length > 0)).toBe(true);
		const pdf = await SELF.fetch(`https://equanime.test${result.report_url}`);
		expect(pdf.status).toBe(200);
		expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 4))).toBe("%PDF");
	});

	it("uses a selection report when no advisor is informed", async () => {
		const { advisor: _advisor, ...selection } = academic;
		const created = await (await post(selection)).json<{ analysis_id: string }>();
		await runAnalysis(env, created.analysis_id);
		const result = await (await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}`)).json<{ type: string; reviewers: Array<{ checks: { recent_advisor_relationship: { applicable: boolean } } }> }>();
		expect(result.type).toBe("selection");
		expect(result.reviewers.every((reviewer) => reviewer.checks.recent_advisor_relationship.applicable === false)).toBe(true);
	});

	it("rejects invalid, duplicate and self-review requests and replays idempotency", async () => {
		expect((await post({ ...academic, candidate: { ...academic.candidate, lattes_url: "https://example.com/nope" } })).status).toBe(400);
		expect((await post({ ...academic, reviewers: [academic.reviewers[0], academic.reviewers[0]] })).status).toBe(400);
		expect((await post({ ...academic, reviewers: [{ ...academic.candidate, role: "titular" }] })).status).toBe(400);
		const first = await post(academic, { "idempotency-key": "same-board" });
		const second = await post(academic, { "idempotency-key": "same-board" });
		expect(second.status).toBe(200);
		expect((await second.json<{ analysis_id: string }>()).analysis_id).toBe((await first.json<{ analysis_id: string }>()).analysis_id);
		expect((await post({ ...academic, work_title: "Outro título" }, { "idempotency-key": "same-board" })).status).toBe(409);
	});
});
