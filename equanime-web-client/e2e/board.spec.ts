import { expect, test, type Page } from "@playwright/test";

const person = (name: string, id: string, status = "complete", message: string | null = null) => ({ name, lattes_url: `http://lattes.cnpq.br/${id}`, collection_status: status, collection_message: message });
const check = (result: string, extra = {}) => ({ detected: false, inconclusive: false, result, evidence: [], ...extra });

function analysis(overrides: Record<string, unknown>) {
	return {
		analysis_id: "play-1",
		type: "selection",
		status: "completed",
		message: "Análise concluída.",
		assistant_summary: "Análise concluída.",
		candidate: person("João da Silva", "1111111111111111"),
		advisor: null,
		work_title: null,
		summary: { reviewers_analyzed: 1, without_identified_conflict: 1, potential_conflict: 0, inconclusive: 0 },
		reviewers: [{
			reviewer: { ...person("Clara Nunes", "6666666666666666"), detected_name: "Clara Nunes", role: "suplente" },
			status: "no_conflict_identified",
			status_label: "SEM CONFLITO IDENTIFICADO",
			checks: {
				coauthorship: check("Sem conflito identificado nas fontes consultadas para coautoria com o candidato."),
				recent_advisor_relationship: check("Não aplicável: banca sem orientador.", { applicable: false }),
				joint_research_projects: check("Sem conflito identificado nas fontes consultadas para participação conjunta em projetos."),
			},
		}],
		limitations: ["O resultado indica apenas o que foi identificado nas fontes consultadas."],
		needs_upload: false,
		report_url: "/analises/play-1/relatorio.pdf",
		created_at: "2026-10-30T12:00:00Z",
		...overrides,
	};
}

async function fill(page: Page) {
	await page.goto("/analises/nova");
	await expect(page.locator("form")).toHaveAttribute("data-hydrated", "true");
	await page.getByLabel("Nome do candidato").fill("João da Silva");
	await page.getByLabel("Lattes do candidato").fill("http://lattes.cnpq.br/1111111111111111");
	await page.getByLabel("Nome do avaliador 1").fill("Clara Nunes");
	await page.getByLabel("Lattes do avaliador 1").fill("http://lattes.cnpq.br/6666666666666666");
	await page.getByRole("button", { name: /Remover/ }).last().click();
}

test("a selection board goes from the form to its report", async ({ page }) => {
	let polls = 0;
	await page.route("**/api/analises", (route) => route.fulfill({ status: 202, json: analysis({ status: "pending", reviewers: [], summary: null, report_url: null }) }));
	await page.route("**/api/analises/play-1", (route) => {
		polls += 1;
		return route.fulfill({ json: polls === 1 ? analysis({ status: "collecting_lattes", message: "Coletando os currículos.", reviewers: [], summary: null, report_url: null }) : analysis({}) });
	});
	await fill(page);
	await page.getByRole("button", { name: "Analisar banca" }).click();
	await expect(page.getByText("Lendo os currículos.")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Clara Nunes" })).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Sem conflito identificado", { exact: true })).toBeVisible();
	await expect(page.getByText("Não se aplica: banca sem orientador.")).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Abrir o relatório em PDF" })).toHaveAttribute("href", "/api/analises/play-1/relatorio.pdf");
});

test("a CV that could not be read is uploaded and the board reprocessed", async ({ page }) => {
	const pending = analysis({
		status: "completed_with_warnings",
		needs_upload: true,
		summary: { reviewers_analyzed: 1, without_identified_conflict: 0, potential_conflict: 0, inconclusive: 1 },
		reviewers: [{
			reviewer: { ...person("Rita Gomes", "9999999999999999", "needs_upload", "A Plataforma Lattes pediu uma verificação humana."), detected_name: null, role: "titular" },
			status: "inconclusive",
			status_label: "ANÁLISE INCONCLUSIVA",
			checks: {
				coauthorship: check("Análise inconclusiva para coautoria com o candidato.", { inconclusive: true }),
				recent_advisor_relationship: check("Não aplicável: banca sem orientador.", { applicable: false }),
				joint_research_projects: check("Análise inconclusiva para participação conjunta em projetos.", { inconclusive: true }),
			},
		}],
	});
	let reprocessed: unknown = null;
	await page.route("**/api/analises/play-1", (route) => route.fulfill({ json: reprocessed ? analysis({}) : pending }));
	await page.route("**/api/curriculos", (route) => route.fulfill({ status: 201, json: { curriculum_ref: "up-1", lattes_id: "9999999999999999", name: "Rita Gomes", updated_at: null, publications: 12, projects: 2, advising: 0 } }));
	await page.route("**/api/analises/play-1/reprocessar", (route) => {
		reprocessed = route.request().postDataJSON();
		return route.fulfill({ status: 202, json: analysis({ status: "pending" }) });
	});
	await page.goto("/analises/play-1");
	await expect(page.getByRole("heading", { name: "Currículos para enviar" })).toBeVisible();
	await page.getByLabel("XML do currículo de Rita Gomes").setInputFiles({ name: "curriculo.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
	await expect(page.getByText("Recebido: Rita Gomes, 12 publicações.")).toBeVisible();
	await page.getByRole("button", { name: "Analisar de novo com os arquivos enviados" }).click();
	await expect(page.getByRole("heading", { name: "Clara Nunes" })).toBeVisible();
	expect(reprocessed).toEqual({ curriculum_refs: ["up-1"] });
});
