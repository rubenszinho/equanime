import { expect, test } from "@playwright/test";

test("submits a selection board and reaches the report state", async ({ page }) => {
	await page.route("**/api/analises", async (route) => {
		await route.fulfill({ json: { analysis_id: "play-1", status: "pending", message: "A análise foi registrada." } });
	});
	await page.route("**/api/analises/play-1", async (route) => {
		await route.fulfill({
			json: {
				analysis_id: "play-1",
				type: "selection",
				status: "completed",
				message: "Análise concluída.",
				assistant_summary: "Foram analisados 1 membros da banca.",
				summary: { reviewers_analyzed: 1, without_identified_conflict: 1, potential_conflict: 0, inconclusive: 0 },
				reviewers: [{
					reviewer: { name: "Clara Nunes", role: "suplente", lattes_url: "http://lattes.cnpq.br/6666666666666666", collection_status: "complete" },
					status_label: "SEM CONFLITO IDENTIFICADO",
					checks: { coauthorship: { result: "Sem conflito identificado nas fontes consultadas para coautoria com o candidato.", evidence: [] } },
				}],
				limitations: ["O resultado indica apenas o que foi identificado nas fontes consultadas."],
				report_url: "/analises/play-1/relatorio.pdf",
			},
		});
	});
	await page.goto("/analises/nova");
	await expect(page.locator("form")).toHaveAttribute("data-hydrated", "true");
	await page.getByLabel("Nome do candidato").fill("João da Silva");
	await page.getByLabel("Lattes do candidato").fill("http://lattes.cnpq.br/1111111111111111");
	await page.getByLabel("Nome do avaliador 1").fill("Clara Nunes");
	await page.getByLabel("Lattes do avaliador 1").fill("http://lattes.cnpq.br/6666666666666666");
	await page.getByRole("button", { name: "Remover" }).last().click();
	await page.getByRole("button", { name: "Analisar banca" }).click();
	await expect(page.getByText("suplente · SEM CONFLITO IDENTIFICADO")).toBeVisible();
	await expect(page.getByRole("link", { name: "Baixar relatório PDF" })).toHaveAttribute("href", "/api/analises/play-1/relatorio.pdf");
});
