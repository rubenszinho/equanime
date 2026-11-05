import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

// The first-visit video would cover the page.
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("equanime-intro-seen", "1")));

// The agent itself is stubbed: this checks the widget, not the model.
test("the chat box expands into the assistant and back, on one conversation", async ({ page }) => {
	await page.route("**/api/me", (route) => route.fulfill({ json: { email: "ana@usp.br", name: "Ana" } }));
	await page.route("**/api/agent/agents", (route) => route.fulfill({ json: [{ id: "banca", name: "Análise de Banca", tagline: "", thinking: false }] }));
	await page.route("**/api/agent/status", (route) => route.fulfill({ json: { ready: true, reason: null, message: null } }));
	await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));

	await page.goto("/");
	await page.getByRole("button", { name: "Abrir o assistente" }).click();
	const box = page.getByRole("region", { name: "Assistente" });
	await expect(box).toBeVisible();
	await expect(box.getByRole("button", { name: "Quero verificar uma banca" })).toBeVisible();

	await box.getByRole("button", { name: /Expandir/ }).click();
	await expect(page).toHaveURL(/#assistente$/);
	const screen = page.getByRole("dialog", { name: "Assistente da Equânime" });
	await expect(screen).toBeVisible();
	await expect(page.getByRole("button", { name: "Abrir o assistente" })).toHaveCount(0);

	await page.keyboard.press("Escape");
	await expect(screen).toHaveCount(0);
	await expect(page).not.toHaveURL(/#assistente/);
	await expect(page.getByRole("button", { name: /assistente/i }).last()).toBeVisible();
});

test("a CV attached in the chat is uploaded and goes out with the question", async ({ page }) => {
	await page.route("**/api/me", (route) => route.fulfill({ json: { email: "ana@usp.br", name: "Ana" } }));
	await page.route("**/api/agent/agents", (route) => route.fulfill({ json: [{ id: "banca", name: "Análise de Banca", tagline: "", thinking: false }] }));
	await page.route("**/api/agent/status", (route) => route.fulfill({ json: { ready: true, reason: null, message: null } }));
	await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
	await page.route("**/api/curriculos", (route) => route.fulfill({ status: 201, json: { curriculum_ref: "ref-9", lattes_id: "9999999999999999", name: "Rita Gomes", publications: 12 } }));
	let question = "";
	await page.route("**/api/agent/stream", async (route) => {
		question = (route.request().postDataJSON() as { message: string }).message;
		await route.fulfill({ headers: { "content-type": "text/event-stream" }, body: 'data: {"type":"text-delta","text":"Recebido."}\n\ndata: [DONE]\n\n' });
	});

	await page.goto("/");
	await page.getByRole("button", { name: "Abrir o assistente" }).click();
	const box = page.getByRole("region", { name: "Assistente" });
	await box.locator('input[type="file"]').setInputFiles({ name: "rita.xml", mimeType: "text/xml", buffer: Buffer.from("<CURRICULO-VITAE/>") });
	await expect(box.getByText("rita.xml")).toBeVisible();
	await box.getByRole("button", { name: "Perguntar" }).click();
	await expect(box.getByText("Recebido.")).toBeVisible();
	expect(question).toContain("Seguem os arquivos.");
	expect(question).toContain("curriculum_ref: ref-9");
	expect(question).toContain("Lattes 9999999999999999");
});

test("a PDF attached in the chat is stored as a document for the agent to read", async ({ page }) => {
	await page.route("**/api/me", (route) => route.fulfill({ json: { email: "ana@usp.br", name: "Ana" } }));
	await page.route("**/api/agent/agents", (route) => route.fulfill({ json: [{ id: "banca", name: "Análise de Banca", tagline: "", thinking: false }] }));
	await page.route("**/api/agent/status", (route) => route.fulfill({ json: { ready: true, reason: null, message: null } }));
	await page.route("**/api/agent/threads", (route) => route.fulfill({ json: [] }));
	let cvs = 0;
	await page.route("**/api/curriculos", (route) => (cvs++, route.fulfill({ status: 500, json: {} })));
	await page.route("**/api/documentos", (route) => route.fulfill({ status: 201, json: { document_ref: "d-1", name: "edital.pdf", content_type: "application/pdf", size: 9 } }));
	let question = "";
	await page.route("**/api/agent/stream", async (route) => {
		question = (route.request().postDataJSON() as { message: string }).message;
		await route.fulfill({ headers: { "content-type": "text/event-stream" }, body: 'data: {"type":"text-delta","text":"Lido."}\n\ndata: [DONE]\n\n' });
	});

	await page.goto("/");
	await page.getByRole("button", { name: "Abrir o assistente" }).click();
	const box = page.getByRole("region", { name: "Assistente" });
	await box.locator('input[type="file"]').setInputFiles({ name: "edital.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
	await expect(box.getByText("edital.pdf")).toBeVisible();
	await box.getByRole("button", { name: "Perguntar" }).click();
	await expect(box.getByText("Lido.")).toBeVisible();
	expect(question).toContain("📄 Documento anexado: edital.pdf. document_ref: d-1");
	expect(cvs).toBe(0);
});
