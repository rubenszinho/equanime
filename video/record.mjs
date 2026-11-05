// Records the segments of the Equânime videos against a local stack (see README.md).
//   node record.mjs <outDir> [segment ...]     segments: intro demo end outro (default: all)
// Each narration line is a `say()`: the subtitle, and the line the narrator reads.
import { record, warm } from "./lib/rec.mjs";

const WEB = process.env.WEB ?? "http://localhost:4323";
const CARDS = new URL("./cards/cards.html", import.meta.url).href;
const [outDir = "out", ...only] = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);

// Cards: one page, scenes revealed step by step in sync with the lines.
async function cards(r, id) {
	const { page } = r;
	await r.settle();
	if (!page.url().startsWith(CARDS)) {
		await page.goto(CARDS);
		await page.evaluate(() => document.fonts.ready);
		await page.mouse.move(1400, 900);
		await page.evaluate(() => { const c = document.getElementById("__rec_cursor"); if (c) c.style.opacity = "0"; });
	}
	await page.evaluate((id) => window.show(id), id);
	return (n = 1) => page.evaluate((n) => window.next(n), n);
}

const showCursor = (page) => page.evaluate(() => { const c = document.getElementById("__rec_cursor"); if (c) c.style.opacity = "1"; });

// ---------------------------------------------------------------- intro (long version only)
const intro = async (r) => {
	let next = await cards(r, "a4g");
	await next(); await r.sleep(300);
	await r.say("Esta história começa no Agents4Gov, um projeto do LABIC, no ICMC da USP.");
	await next(); await r.sleep(700); await next(2);
	await r.say("A proposta: usar modelos de linguagem para apoiar o servidor público nas tarefas burocráticas e repetitivas.");

	next = await cards(r, "chores");
	await next();
	await r.say("Buscar dados, conferir documentos, cruzar informações e registrar de onde cada uma veio.");
	for (let i = 0; i < 4; i++) { await r.sleep(750); await next(); }

	next = await cards(r, "lib");
	await next(2);
	await r.say("Cada tarefa virou uma ferramenta de uma biblioteca em Python, usada como Tool no OpenWebUI.");
	await r.sleep(600); await next();
	for (let i = 0; i < 3; i++) { await r.sleep(450); await next(); }
	await r.say("Uma delas verificava conflito de interesses em bancas, a partir dos Currículos Lattes.");
	await next(2);

	next = await cards(r, "grow");
	await next();
	await r.say("Só que fazer isso direito exigia muito mais do que uma função.");
	await r.say("Acesso institucional ao CNPq, o envio do XML quando o Lattes pede verificação humana, regras auditáveis…");
	for (let i = 0; i < 3; i++) { await r.sleep(900); await next(); }
	await r.say("…um relatório em PDF, prazo para apagar os dados e um assistente para conversar.");
	for (let i = 0; i < 3; i++) { await r.sleep(900); await next(); }

	next = await cards(r, "shift");
	await next();
	await r.say("Complexo demais para continuar sendo uma biblioteca. Por isso, virou uma plataforma: a Equânime.");
	await r.sleep(1500); await next(); await r.sleep(500); await next();
	await r.sleep(1600); await next();
	await r.hush();
	await r.sleep(1400);
};

// ---------------------------------------------------------------- demo (both versions)
const demo = async (r) => {
	const { page } = r;
	let next = await cards(r, "title");
	await r.sleep(400); await next();
	await r.say("Toda banca precisa de uma conferência: algum avaliador tem vínculo com o candidato?");
	await r.sleep(900); await next();
	await r.say("A Equânime faz essa conferência a partir dos Currículos Lattes, e mostra a evidência de cada resultado.");

	// Home
	await r.say("Na página inicial, um exemplo do que você recebe: cada pessoa da banca com o seu resultado.");
	await page.goto(WEB + "/");
	await page.mouse.move(900, 520);
	await showCursor(page);
	await r.sleep(1200);
	await r.moveTo(page.locator(".sheet, [class*=sheet]").first().locator("text=Rafael Costa").first());
	await r.sleep(1200);
	await r.moveTo(page.locator("text=Túlio Andrade").first());
	await r.sleep(800);

	await r.say("São três regras: coautoria com o candidato, relação recente com o orientador e projeto de pesquisa conjunto.");
	await r.scroll(page.getByRole("heading", { name: "As três regras" }), { duration: 1600, offset: 120 });
	await r.moveTo(page.locator("dl.rules dt", { hasText: "Coautoria com o candidato" }));
	await r.sleep(700);
	await r.moveTo(page.locator("dl.rules dt", { hasText: "Relação recente com o orientador" }));
	await r.sleep(700);
	await r.moveTo(page.locator("dl.rules dt", { hasText: "Projeto de pesquisa conjunto" }));
	await r.say("As regras são aplicadas sempre da mesma forma. Um modelo de linguagem só ajuda a reconhecer o mesmo nome escrito de jeitos diferentes.");
	await r.scroll(page.getByRole("heading", { name: "Nomes escritos de várias formas" }), { duration: 1400, offset: 200 });

	// Form
	await r.say("Para começar uma análise, informe o candidato e o endereço do Currículo Lattes dele.");
	await r.scroll(0 - 99999, { duration: 900 });
	await r.click(page.getByRole("link", { name: "Nova análise" }).first());
	await page.waitForSelector('form[data-hydrated="true"]');
	await page.evaluate(() => { for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("Preencher com um exemplo")) b.closest("p")?.remove(); });
	await r.type(page.getByLabel("Nome do candidato"), "João da Silva");
	await r.type(page.getByLabel("Lattes do candidato"), "http://lattes.cnpq.br/1111111111111111", { delay: 22 });

	await r.say("Com orientador, a banca é tratada como acadêmica, e a relação de orientação também é verificada.");
	await r.type(page.getByLabel("Nome do orientador"), "Maria Souza");
	await r.type(page.getByLabel("Lattes do orientador"), "http://lattes.cnpq.br/2222222222222222", { delay: 22 });
	await r.type(page.getByLabel("Título do trabalho"), "Métodos de Inteligência Artificial para políticas públicas", { delay: 18 });

	await r.say("Depois, os avaliadores, titulares e suplentes, cada um com o seu Lattes.");
	await r.fast(3, async () => {
		const people = [["Carlos Pereira", "3333333333333333", "Titular"], ["Ana Santos", "4444444444444444", "Titular"], ["Pedro Oliveira", "5555555555555555", "Suplente"], ["Clara Nunes", "6666666666666666", "Suplente"]];
		for (const [i, [name, id, role]] of people.entries()) {
			if (i >= 2) await r.click(page.getByRole("button", { name: "Adicionar avaliador" }), { duration: 400 });
			await r.type(page.getByLabel(`Nome do avaliador ${i + 1}`), name, { delay: 30 });
			await r.type(page.getByLabel(`Lattes do avaliador ${i + 1}`), `http://lattes.cnpq.br/${id}`, { delay: 14 });
			if (role === "Suplente") await r.click(page.getByRole("radiogroup", { name: `Papel do avaliador ${i + 1}` }).getByText("Suplente"), { duration: 350 });
		}
	});

	await r.say("Ao enviar, a Equânime lê os currículos e aplica as regras.");
	await r.click(page.getByRole("button", { name: "Analisar banca" }));
	await page.waitForURL(/analises\/(?!nova)/);
	await page.getByRole("heading", { name: "Titulares" }).waitFor({ timeout: 60_000 });
	await r.sleep(1200);

	// Result
	await r.say("O resumo mostra quantos avaliadores ficaram sem conflito identificado, com possível conflito ou inconclusivos.");
	await r.moveTo(page.getByText("avaliadores analisados"));
	await r.sleep(600);
	await r.moveTo(page.getByText("com possível conflito"));
	await r.sleep(600);

	await r.say("Cada possível conflito traz a evidência: a publicação, o projeto ou a orientação, e de qual currículo ela veio.");
	await r.scroll(page.getByRole("heading", { name: "Carlos Pereira" }), { duration: 1300, offset: 70 });
	await r.moveTo(page.getByText("Métodos de Inteligência Artificial para políticas públicas (2024)").first());
	await r.sleep(900);
	await r.scroll(page.getByRole("heading", { name: "Ana Santos" }), { duration: 1300, offset: 70 });
	await r.moveTo(page.getByText("Projeto Alpha de métodos computacionais (2023–2025)").first());

	await r.say("Aqui, um suplente foi orientado no doutorado pela orientadora do candidato, em 2024.");
	await r.scroll(page.getByRole("heading", { name: "Pedro Oliveira" }), { duration: 1300, offset: 70 });
	await r.moveTo(page.getByText(/Orientação concluída de doutorado/).first());

	await r.say("Sem conflito identificado quer dizer que nada apareceu nas fontes consultadas. Não é prova de que o conflito não existe.");
	await r.scroll(page.getByRole("heading", { name: "Clara Nunes" }), { duration: 1300, offset: 70 });
	await r.moveTo(page.getByText("Sem conflito identificado", { exact: true }).last());

	// PDF
	await r.say("O relatório em PDF reúne tudo isso, pronto para anexar ao processo.");
	await r.scroll(0 - 99999, { duration: 1200 });
	const pdf = page.getByRole("link", { name: "Abrir o relatório em PDF" });
	await r.moveTo(pdf);
	const href = await pdf.getAttribute("href");
	await r.sleep(300);
	// The link opens a new tab; the take stays in one window, so only the click is drawn.
	await page.evaluate(() => { const p = window.__rec_pos; window.dispatchEvent(new MouseEvent("mousedown", { clientX: p.x, clientY: p.y })); });
	await r.sleep(350);
	await page.goto(WEB + href);
	await r.sleep(2600);
	await page.mouse.wheel(0, 700);
	await r.sleep(1800);

	// A CV that could not be read
	await r.say("Quando um currículo não pode ser lido, a pessoa fica como inconclusiva. Nunca como sem conflito.");
	await page.goto(r.inconclusive);
	await page.getByRole("heading", { name: "Rita Gomes" }).waitFor();
	await showCursor(page);
	await r.sleep(500);
	await r.scroll(page.getByRole("heading", { name: "Rita Gomes" }), { duration: 1200, offset: 160 });
	await r.moveTo(page.getByText("Análise inconclusiva", { exact: true }).first());
	await r.say("Basta enviar o XML baixado no próprio Lattes e analisar de novo.");
	// Brief hovers: a file input's native tooltip ("No file chosen") would show after a second.
	const open = page.getByRole("link", { name: "Abrir no Lattes" }).first();
	await r.scroll(open, { duration: 900, offset: 260 });
	await r.moveTo(open);
	await r.sleep(500);
	await r.moveTo(page.getByText("Escolher o XML").first(), { duration: 450 });
	await r.sleep(350);
	await r.moveTo(page.getByRole("button", { name: /Analisar de novo/ }).first(), { duration: 500 });
	await r.sleep(700);

	// Assistant
	await r.say("Tudo isso também funciona numa conversa, com o assistente Análise de Banca.");
	await r.click(page.getByRole("button", { name: "Abrir o assistente" }));
	const box = page.getByRole("region", { name: "Assistente" });
	await box.waitFor();
	await r.sleep(700);
	await r.click(box.getByRole("button", { name: /Expandir/ }));
	await r.sleep(600);

	await r.say("Você descreve a banca do seu jeito, com os endereços do Lattes.");
	const input = page.getByRole("dialog", { name: "Assistente da Equânime" }).getByRole("textbox").first();
	await r.click(input);
	const message = "Quero verificar uma banca de doutorado. Candidato: João da Silva, http://lattes.cnpq.br/1111111111111111. Orientadora: Maria Souza, http://lattes.cnpq.br/2222222222222222. Titulares: Carlos Pereira, http://lattes.cnpq.br/3333333333333333 e Ana Santos, http://lattes.cnpq.br/4444444444444444. Suplente: Clara Nunes, http://lattes.cnpq.br/6666666666666666";
	await r.fast(3, () => input.pressSequentially(message, { delay: 14 }));
	await r.sleep(400);
	await page.keyboard.press("Enter");

	await r.say("O assistente cria a análise e acompanha a leitura dos currículos…");
	const dialog = page.getByRole("dialog", { name: "Assistente da Equânime" });
	await r.fast(4, async () => {
		// The answer is done when the send button is back (no stop button).
		await r.sleep(3000);
		for (let i = 0; i < 240; i++) {
			const streaming = await dialog.getByRole("button", { name: /Parar|Interromper|Stop/i }).count();
			if (!streaming && (await dialog.getByText(/Relatório|relatório/).count())) break;
			await r.sleep(500);
		}
	});
	await r.say("…e responde com o resultado de cada avaliador e o link para o relatório.");
	await r.moveTo(dialog.getByText(/Carlos Pereira/).last());
	await r.sleep(1200);
	// Near the report link, not on it: the status bar would show the local agent's URL.
	const link = await dialog.getByRole("link", { name: /PDF|relat/i }).last().boundingBox();
	await r.moveTo({ x: link.x + link.width + 60, y: link.y + link.height / 2 });
	await r.sleep(800);
	await r.say("No mesmo chat, dá para anexar o edital ou a ata: o assistente tira a banca do documento.");
	await r.moveTo(dialog.getByRole("button", { name: /Anexar/i }).first());
	await r.sleep(1500);
	await r.hush();
	await r.sleep(600);
};

// ---------------------------------------------------------------- end card (short version)
const end = async (r) => {
	const next = await cards(r, "end");
	await r.sleep(300); await next();
	await r.say("Equânime: apoio à decisão para bancas. Quem aprova a composição da banca é sempre uma pessoa.");
	await r.sleep(900); await next(); await r.sleep(700); await next();
	await r.hush();
	await r.sleep(2200);
};

// ---------------------------------------------------------------- outro (long version only)
const outro = async (r) => {
	let next = await cards(r, "doors");
	await next();
	await r.say("Hoje, a mesma análise chega por várias portas: o site, a API para o OpenWebUI do Agents4Gov e o chat do rubry.ai.");
	for (let i = 0; i < 3; i++) { await r.sleep(1100); await next(); }
	await next();
	await r.say("Sempre com as mesmas três regras e o mesmo relatório.");

	next = await cards(r, "next");
	await next(2);
	await r.say("Os próximos passos: abrir o site para qualquer pessoa conhecer a ferramenta…");
	await next();
	await r.say("…pedir o login só para usar o assistente e as análises…");
	await r.sleep(300); await next();
	await r.say("…e ler os currículos direto do CNPq, assim que o extrator for liberado para a USP.");
	await r.sleep(300); await next();

	next = await cards(r, "credits");
	await r.sleep(300); await next();
	await r.say("Equânime: nascida no Agents4Gov, do LABIC, ICMC-USP, e feita pela Rubrion.");
	await r.sleep(800); await next(); await r.sleep(700); await next();
	await r.hush();
	await r.sleep(2500);
};

// ---------------------------------------------------------------- curta (the presentation, under a minute)
const curta = async (r) => {
	const { page } = r;
	let next = await cards(r, "a4g");
	await next(4);
	await r.say("O Agents4Gov, um projeto PUB do ICMC-USP, usa IA para apoiar o servidor público em tarefas repetitivas.");

	next = await cards(r, "lib");
	await next(8);
	await r.say("Uma das ferramentas checava conflito de interesses em bancas, pelo Lattes.");

	next = await cards(r, "grow");
	await next();
	await r.say("Mas exigia acesso ao CNPq, regras auditáveis e um assistente.");
	for (let i = 0; i < 6; i++) { await r.sleep(380); await next(); }

	next = await cards(r, "shift");
	await next(3);
	await r.say("Virou uma plataforma: a Equânime.");
	await r.sleep(900); await next();

	await r.settle();
	await r.say("Você informa a banca, com o Lattes de cada pessoa…");
	await page.goto(WEB + "/analises/nova");
	await page.waitForSelector('form[data-hydrated="true"]');
	await page.evaluate(() => { for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("Preencher com um exemplo")) b.closest("p")?.remove(); });
	await page.mouse.move(700, 300);
	await showCursor(page);
	await r.fast(5, async () => {
		await r.type(page.getByLabel("Nome do candidato"), "João da Silva", { delay: 25 });
		await r.type(page.getByLabel("Lattes do candidato"), "http://lattes.cnpq.br/1111111111111111", { delay: 10 });
		await r.type(page.getByLabel("Nome do orientador"), "Maria Souza", { delay: 25 });
		await r.type(page.getByLabel("Lattes do orientador"), "http://lattes.cnpq.br/2222222222222222", { delay: 10 });
		await r.type(page.getByLabel("Nome do avaliador 1"), "Carlos Pereira", { delay: 25 });
		await r.type(page.getByLabel("Lattes do avaliador 1"), "http://lattes.cnpq.br/3333333333333333", { delay: 10 });
		await r.type(page.getByLabel("Nome do avaliador 2"), "Pedro Oliveira", { delay: 25 });
		await r.type(page.getByLabel("Lattes do avaliador 2"), "http://lattes.cnpq.br/5555555555555555", { delay: 10 });
		await r.click(page.getByRole("radiogroup", { name: "Papel do avaliador 2" }).getByText("Suplente"), { duration: 300 });
		await r.click(page.getByRole("button", { name: "Analisar banca" }));
		await page.waitForURL(/analises\/(?!nova)/);
		await page.getByRole("heading", { name: "Titulares" }).waitFor({ timeout: 60_000 });
	});

	await r.say("…e recebe cada avaliador com a evidência do conflito.");
	await r.moveTo(page.getByText("com possível conflito"));
	await r.sleep(500);
	await r.scroll(page.getByRole("heading", { name: "Carlos Pereira" }), { duration: 1100, offset: 70 });
	await r.moveTo(page.getByText("Métodos de Inteligência Artificial para políticas públicas (2024)").first());

	await r.say("Ou descreve a banca numa conversa com o assistente.");
	await r.click(page.getByRole("button", { name: "Abrir o assistente" }), { duration: 500 });
	const box = page.getByRole("region", { name: "Assistente" });
	await box.waitFor();
	await r.click(box.getByRole("button", { name: /Expandir/ }), { duration: 400 });
	const dialog = page.getByRole("dialog", { name: "Assistente da Equânime" });
	const input = dialog.getByRole("textbox").first();
	await r.click(input, { duration: 400 });
	const message = "Verifique esta banca de doutorado. Candidato: João da Silva, http://lattes.cnpq.br/1111111111111111. Orientadora: Maria Souza, http://lattes.cnpq.br/2222222222222222. Titular: Ana Santos, http://lattes.cnpq.br/4444444444444444. Suplente: Clara Nunes, http://lattes.cnpq.br/6666666666666666";
	await r.fast(6, async () => {
		await input.pressSequentially(message, { delay: 10 });
		await page.keyboard.press("Enter");
		await r.sleep(3000);
		for (let i = 0; i < 240; i++) {
			const streaming = await dialog.getByRole("button", { name: /Parar/i }).count();
			if (!streaming && (await dialog.getByRole("link", { name: /PDF|relat/i }).count())) break;
			await r.sleep(500);
		}
	});
	await r.say("Ele analisa e responde com o relatório.");
	await r.moveTo(dialog.getByText(/Ana Santos/).last());
	await r.sleep(800);

	next = await cards(r, "end");
	await next(3);
	await r.say("Equânime: apoio à decisão para bancas.");
	await r.hush();
	await r.sleep(1600);
};

// Earlier takes' conversations would show in the chat's sidebar.
async function clearThreads() {
	const threads = await (await fetch(`${WEB}/api/agent/threads`)).json();
	for (const t of threads) await fetch(`${WEB}/api/agent/threads/${t.id}?agent=${encodeURIComponent(t.agent)}`, { method: "DELETE", headers: { origin: WEB } });
}

// A board with a CV Lattes asked a human to verify, made before the take so the page is ready.
async function inconclusiveBoard() {
	const res = await fetch(`${WEB}/api/analises`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: WEB },
		body: JSON.stringify({
			candidate: { name: "João da Silva", lattes_url: "http://lattes.cnpq.br/1111111111111111" },
			reviewers: [
				{ name: "Rita Gomes", lattes_url: "http://lattes.cnpq.br/9999999999999999", role: "titular" },
				{ name: "Clara Nunes", lattes_url: "http://lattes.cnpq.br/6666666666666666", role: "titular" },
			],
		}),
	});
	if (!res.ok) throw new Error(`POST /api/analises: ${res.status} ${await res.text()}`);
	const { analysis_id } = await res.json();
	for (let i = 0; i < 60; i++) {
		const a = await (await fetch(`${WEB}/api/analises/${analysis_id}`)).json();
		if (!["pending", "collecting_lattes", "analyzing", "generating_report"].includes(a.status)) break;
		await new Promise((r) => setTimeout(r, 500));
	}
	return `${WEB}/analises/${analysis_id}`;
}

if (["demo", "curta"].some(want)) {
	await warm([`${WEB}/`, `${WEB}/analises/nova`], async (page, url) => {
		if (url.endsWith("/nova")) await page.waitForSelector('form[data-hydrated="true"]', { timeout: 120_000 });
	});
}
if (want("intro")) await record("intro", outDir, intro);
if (want("demo")) {
	await clearThreads();
	const url = await inconclusiveBoard();
	await record("demo", outDir, async (r) => { r.inconclusive = url; await demo(r); });
}
if (want("end")) await record("end", outDir, end);
if (want("curta")) {
	await clearThreads();
	await record("curta", outDir, curta);
}
if (want("outro")) await record("outro", outDir, outro);
