import { afterEach, describe, expect, it, vi } from "vitest";
import { httpProvider } from "../src/collector";
import type { Curriculum } from "../src/domain";
import { evaluateReviewer } from "../src/rules";

// What the collector's `busca` source returns: CNPq's CV page read into a Curriculum.
// Co-authors come in citation form, with Lattes IDs only where CNPq links them.
function page(extra: Partial<Curriculum>): Curriculum {
	return {
		requested_name: "",
		detected_name: null,
		lattes_id: "",
		lattes_url: "",
		consulted_at: "2026-11-23T00:00:00.000Z",
		source: "public_page",
		aliases: [],
		collection_status: "complete",
		error_type: null,
		error_message: null,
		warnings: [],
		publications: [],
		projects: [],
		advising: [],
		training: [],
		...extra,
	};
}

const candidate = page({
	requested_name: "Ana Lima",
	detected_name: "Ana Pereira Lima",
	lattes_id: "1111111111111111",
	lattes_url: "http://lattes.cnpq.br/1111111111111111",
	aliases: ["LIMA, A. P."],
	publications: [
		{ title: "Um estudo", year: 2024, authors: ["LIMA, A. P.", "RAMOS, C. S."], author_ids: [], source_record: "Artigo 2024 — Um estudo" },
		{ title: "Outro estudo", year: 2023, authors: ["LIMA, A. P.", "NUNES, B."], author_ids: ["6666666666666666"], source_record: "Artigo 2023 — Outro estudo" },
	],
});

describe("CVs read from CNPq's public page", () => {
	it("finds co-authorship by citation name when CNPq did not link the co-author", async () => {
		const reviewer = page({ requested_name: "Carlos Ramos", detected_name: "Carlos Souza Ramos", lattes_id: "2222222222222222", aliases: ["RAMOS, C. S.", "RAMOS, CARLOS"] });
		const result = await evaluateReviewer({ candidate, reviewer, advisor: null, analyzedAt: "2026-11-23T00:00:00.000Z" });
		expect(result.checks.coauthorship.detected).toBe(true);
		expect(result.status).toBe("potential_conflict");
	});

	it("finds co-authorship by Lattes ID when CNPq linked the co-author", async () => {
		const reviewer = page({ requested_name: "Beatriz", detected_name: "Beatriz Nunes", lattes_id: "6666666666666666", aliases: [] });
		const result = await evaluateReviewer({ candidate, reviewer, advisor: null, analyzedAt: "2026-11-23T00:00:00.000Z" });
		expect(result.checks.coauthorship.detected).toBe(true);
	});
});

describe("the HTTP collector", () => {
	afterEach(() => vi.restoreAllMocks());

	it("passes a CV the collector parsed straight through", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "completed", curriculum: candidate }));
		const result = await httpProvider("https://collector.test", "t").status("job");
		expect(result).toEqual({ done: true, curriculum: candidate });
	});

	it("turns a captcha into an error the pipeline sends to upload", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "failed", error: { type: "captcha_required", message: "O site do CNPq pediu captcha." } }));
		const result = await httpProvider("https://collector.test", "t").status("job");
		expect(result).toEqual({ done: true, error: { type: "captcha_required", message: "O site do CNPq pediu captcha." } });
	});
});
