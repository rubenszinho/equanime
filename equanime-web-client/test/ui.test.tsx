import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalysisForm from "../src/components/AnalysisForm";
import AnalysisView from "../src/components/AnalysisView";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body });

const check = (result: string, evidence: unknown[] = [], extra = {}) => ({ detected: evidence.length > 0, inconclusive: false, result, evidence, ...extra });

const finished = {
	analysis_id: "abc",
	type: "academic",
	status: "completed_with_warnings",
	message: "Análise concluída com ressalvas.",
	assistant_summary: "Análise concluída.",
	candidate: { name: "João da Silva", lattes_url: "http://lattes.cnpq.br/1111111111111111", collection_status: "complete", collection_message: null },
	advisor: { name: "Maria Souza", lattes_url: "http://lattes.cnpq.br/2222222222222222", collection_status: "complete", collection_message: null },
	work_title: null,
	summary: { reviewers_analyzed: 2, without_identified_conflict: 0, potential_conflict: 1, inconclusive: 1 },
	reviewers: [
		{
			reviewer: { name: "Carlos Pereira", detected_name: "Carlos Pereira", role: "titular", lattes_url: "http://lattes.cnpq.br/3333333333333333", collection_status: "complete", collection_message: null },
			status: "potential_conflict",
			status_label: "POSSÍVEL CONFLITO IDENTIFICADO",
			checks: {
				coauthorship: check("Possível conflito identificado em coautoria com o candidato.", [{ rule: "coauthorship", people: ["João da Silva", "Carlos Pereira"], record: "Artigo 2024 — Métodos", year_or_period: "2024", source_curriculum: "João da Silva (http://lattes.cnpq.br/1111111111111111)", consulted_at: "2026-10-30T12:00:00Z", publication: "Métodos", authors: ["João da Silva", "Carlos Pereira"], confidence: "high" }]),
				recent_advisor_relationship: check("Sem conflito identificado.", [], { applicable: true }),
				joint_research_projects: check("Sem conflito identificado."),
			},
		},
		{
			reviewer: { name: "Rita Gomes", detected_name: null, role: "suplente", lattes_url: "http://lattes.cnpq.br/9999999999999999", collection_status: "needs_upload", collection_message: "A Plataforma Lattes pediu uma verificação humana." },
			status: "inconclusive",
			status_label: "ANÁLISE INCONCLUSIVA",
			checks: {
				coauthorship: { ...check("Análise inconclusiva."), inconclusive: true },
				recent_advisor_relationship: check("Sem conflito identificado.", [], { applicable: true }),
				joint_research_projects: { ...check("Análise inconclusiva."), inconclusive: true },
			},
		},
	],
	limitations: ["Currículo de Rita Gomes recuperado de forma incompleta ou indisponível."],
	needs_upload: true,
	report_url: "/analises/abc/relatorio.pdf",
	created_at: "2026-10-30T12:00:00Z",
};

describe("analysis form", () => {
	it("marks each missing field where it is", async () => {
		const user = userEvent.setup();
		render(<AnalysisForm />);
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		expect(screen.getByText("Informe o nome do candidato.")).toBeTruthy();
		expect(screen.getByLabelText("Nome do candidato").getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByText("Revise o nome e o Currículo Lattes do avaliador 1.")).toBeTruthy();
	});

	it("sends a selection board when there is no advisor and catches duplicates", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn().mockResolvedValue(json({ analysis_id: "abc" }, 202));
		vi.stubGlobal("fetch", fetchMock);
		const assign = vi.fn();
		vi.stubGlobal("location", { assign });
		render(<AnalysisForm />);
		await user.type(screen.getByLabelText("Nome do candidato"), "João da Silva");
		await user.type(screen.getByLabelText("Lattes do candidato"), "http://lattes.cnpq.br/1111111111111111");
		for (const index of [1, 2]) {
			await user.type(screen.getByLabelText(`Nome do avaliador ${index}`), "Carlos Pereira");
			await user.type(screen.getByLabelText(`Lattes do avaliador ${index}`), "http://lattes.cnpq.br/3333333333333333");
		}
		expect(screen.getByText("Será analisada como banca de concurso ou processo seletivo.")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		expect(screen.getByText("O mesmo currículo aparece mais de uma vez entre os avaliadores.")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
		await user.click(screen.getAllByRole("button", { name: /Remover/ })[1]!);
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(payload.advisor).toBeUndefined();
		expect(payload.reviewers).toHaveLength(1);
		expect(assign).toHaveBeenCalledWith("/analises/abc");
	});

	it("explains an expired Access session instead of failing silently", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers({ "content-type": "text/html" }), json: async () => { throw new Error("html"); } }));
		render(<AnalysisForm />);
		await user.type(screen.getByLabelText("Nome do candidato"), "João da Silva");
		await user.type(screen.getByLabelText("Lattes do candidato"), "http://lattes.cnpq.br/1111111111111111");
		await user.type(screen.getByLabelText("Nome do avaliador 1"), "Carlos Pereira");
		await user.type(screen.getByLabelText("Lattes do avaliador 1"), "http://lattes.cnpq.br/3333333333333333");
		await user.click(screen.getAllByRole("button", { name: /Remover/ })[1]!);
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		expect((await screen.findByRole("alert")).textContent).toContain("sessão expirou");
		expect((screen.getByRole("button", { name: "Analisar banca" }) as HTMLButtonElement).disabled).toBe(false);
	});
});

describe("analysis view", () => {
	it("shows verdicts, evidence, the PDF and what to upload", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(finished)));
		render(<AnalysisView analysisId="abc" />);
		expect(await screen.findByRole("heading", { name: "João da Silva" })).toBeTruthy();
		expect(screen.getAllByText("Possível conflito identificado").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Análise inconclusiva").length).toBeGreaterThan(0);
		expect(screen.getByText("Evidências (1)")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Abrir o relatório em PDF" }).getAttribute("href")).toBe("/api/analises/abc/relatorio.pdf");
		expect(screen.getByRole("heading", { name: "Currículos para enviar" })).toBeTruthy();
		expect(screen.getByLabelText("XML do currículo de Rita Gomes")).toBeTruthy();
		expect((screen.getByRole("button", { name: "Analisar de novo com os arquivos enviados" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("says when an analysis is someone else's", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ status: "error", message: "Análise não encontrada." }, 404)));
		render(<AnalysisView analysisId="nope" />);
		expect(await screen.findByText(/não existe ou foi criada por outra pessoa/)).toBeTruthy();
	});
});
