import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AnalysisForm from "../src/components/AnalysisForm";
import AnalysisView from "../src/components/AnalysisView";

afterEach(() => cleanup());

describe("analysis form", () => {
	it("asks for the required board data", async () => {
		const user = userEvent.setup();
		render(<AnalysisForm />);
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		expect(screen.getByText("Informe o nome do candidato.")).toBeTruthy();
	});

	it("distinguishes an academic submission from a selection board", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ analysis_id: "abc" }),
		});
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("location", { assign: vi.fn() });
		render(<AnalysisForm />);
		await user.type(screen.getByLabelText("Nome do candidato"), "João da Silva");
		await user.type(screen.getByLabelText("Lattes do candidato"), "http://lattes.cnpq.br/1111111111111111");
		await user.type(screen.getByLabelText("Nome do avaliador 1"), "Carlos Pereira");
		await user.type(screen.getByLabelText("Lattes do avaliador 1"), "http://lattes.cnpq.br/3333333333333333");
		await user.click(screen.getAllByRole("button", { name: "Remover" })[1]!);
		await user.click(screen.getByRole("button", { name: "Analisar banca" }));
		expect(fetchMock).toHaveBeenCalled();
		const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
		expect(payload.advisor).toBeUndefined();
	});
});

describe("analysis view", () => {
	it("shows conflict evidence and the PDF link", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				analysis_id: "abc",
				type: "academic",
				status: "completed",
				message: "Análise concluída.",
				assistant_summary: "Foram analisados 1 membros da banca.",
				summary: { reviewers_analyzed: 1, without_identified_conflict: 0, potential_conflict: 1, inconclusive: 0 },
				reviewers: [{
					reviewer: { name: "Carlos Pereira", role: "titular", lattes_url: "http://lattes.cnpq.br/3333333333333333", collection_status: "complete" },
					status_label: "POSSÍVEL CONFLITO IDENTIFICADO",
					checks: { coauthorship: { result: "Possível conflito identificado em coautoria com o candidato.", evidence: [{ record: "Publicação compartilhada", year_or_period: "2024" }] } },
				}],
				limitations: ["O resultado indica apenas o que foi identificado nas fontes consultadas."],
				report_url: "/analises/abc/relatorio.pdf",
			}),
		}));
		render(<AnalysisView analysisId="abc" />);
		expect(await screen.findByText(/POSSÍVEL CONFLITO IDENTIFICADO/)).toBeTruthy();
		expect(screen.getByRole("link", { name: "Baixar relatório PDF" }).getAttribute("href")).toBe("/api/analises/abc/relatorio.pdf");
	});
});
