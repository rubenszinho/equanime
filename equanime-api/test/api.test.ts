import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import sample from "./fixtures/lattes-sample.xml?raw";
import { createApp } from "../src/app";
import { runAnalysis } from "../src/pipeline";
import { latin1 } from "./helpers";

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
		expect(spec.paths["/analises/{analysis_id}/reprocessar"]).toBeTruthy();
		expect(spec.paths["/curriculos"]).toBeTruthy();
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

	it("marks an unreadable CV for upload, then resolves it after the XML is sent", async () => {
		const board = {
			candidate: academic.candidate,
			advisor: academic.advisor,
			// Nobody the candidate's CV names: only the reviewer's own CV can show a conflict.
			reviewers: [{ name: "Rita Gomes", lattes_url: "http://lattes.cnpq.br/9999999999999999", role: "titular" }],
		};
		const created = await (await post(board)).json<{ analysis_id: string }>();
		await runAnalysis(env, created.analysis_id);
		type View = { status: string; needs_upload: boolean; web_url: string; reviewers: Array<{ status: string; reviewer: { collection_status: string } }> };
		const before = await (await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}`)).json<View>();
		expect(before.status).toBe("completed_with_warnings");
		expect(before.needs_upload).toBe(true);
		expect(before.web_url).toBe(`https://equanime.test/analises/${created.analysis_id}`);
		expect(before.reviewers[0]).toMatchObject({ status: "inconclusive", reviewer: { collection_status: "needs_upload" } });

		const form = new FormData();
		form.set("file", new File([latin1(sample.replace('NUMERO-IDENTIFICADOR="3333333333333333"', 'NUMERO-IDENTIFICADOR="9999999999999999"'))], "curriculo.xml", { type: "text/xml" }));
		const uploaded = await SELF.fetch("https://equanime.test/curriculos", { method: "POST", body: form });
		expect(uploaded.status).toBe(201);
		const upload = await uploaded.json<{ curriculum_ref: string; lattes_id: string; publications: number }>();
		expect(upload).toMatchObject({ lattes_id: "9999999999999999", publications: 2 });

		const wrong = new FormData();
		wrong.set("file", new File(["<html/>"], "x.xml"));
		expect((await SELF.fetch("https://equanime.test/curriculos", { method: "POST", body: wrong })).status).toBe(400);

		const again = await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}/reprocessar`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ curriculum_refs: [upload.curriculum_ref] }),
		});
		expect(again.status).toBe(202);
		await runAnalysis(env, created.analysis_id);
		const after = await (await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}`)).json<View & { reviewers: Array<{ checks: Record<string, { detected: boolean }> }> }>();
		expect(after.needs_upload).toBe(false);
		expect(after.reviewers[0]?.status).toBe("potential_conflict");
		expect(after.reviewers[0]?.checks.coauthorship.detected).toBe(true);
		expect(after.reviewers[0]?.checks.recent_advisor_relationship.detected).toBe(true);
	});

	it("never fails an analysis because the collector is down", async () => {
		const created = await (await post(academic)).json<{ analysis_id: string }>();
		const down = { ...env, COLLECTOR_MODE: "http", COLLECTOR_URL: "http://127.0.0.1:9", COLLECTOR_TOKEN: "token" } as CloudflareBindings;
		await runAnalysis(down, created.analysis_id);
		const result = await (await SELF.fetch(`https://equanime.test/analises/${created.analysis_id}`)).json<{ status: string; needs_upload: boolean; summary: { inconclusive: number } }>();
		expect(result.status).toBe("completed_with_warnings");
		expect(result.needs_upload).toBe(true);
		expect(result.summary.inconclusive).toBe(4);
	});

	it("keeps each caller's analyses to themselves", async () => {
		const app = createApp();
		const secured = { ...env, AUTH_MODE: "access", OPENWEBUI_KEY: "integration-key", POLICY_AUD: "" } as CloudflareBindings;
		const call = async (path: string, init: RequestInit = {}) => {
			const ctx = createExecutionContext();
			const response = await app.fetch(new Request(`https://equanime.test${path}`, init), secured, ctx);
			await waitOnExecutionContext(ctx);
			return response;
		};
		expect((await call("/openapi.json")).status).toBe(200);
		expect((await call("/analises", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(academic) })).status).toBe(401);
		expect((await call("/analises", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong" }, body: JSON.stringify(academic) })).status).toBe(401);
		const mine = await call("/analises", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer integration-key" }, body: JSON.stringify(academic) });
		expect(mine.status).toBe(202);
		const { analysis_id } = await mine.json<{ analysis_id: string }>();
		expect((await call(`/analises/${analysis_id}`, { headers: { authorization: "Bearer integration-key" } })).status).toBe(200);
		// Created by someone else (the dev actor): looks missing.
		const other = await (await post(academic)).json<{ analysis_id: string }>();
		expect((await call(`/analises/${other.analysis_id}`, { headers: { authorization: "Bearer integration-key" } })).status).toBe(404);
		expect((await call(`/analises/${other.analysis_id}/relatorio.pdf`, { headers: { authorization: "Bearer integration-key" } })).status).toBe(404);
	});
});
