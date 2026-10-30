import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { asPerson } from "../src/caller";
import { v1Person } from "../src/index";
import { consultarAnalise, minhasAnalises, reprocessarAnalise } from "../src/tools";

const run = (tool: { execute?: (...args: never[]) => unknown }, input: unknown) => (tool.execute as (input: unknown, context: unknown) => Promise<Record<string, unknown>>)(input, {});

describe("who the agent acts for", () => {
	const v1 = (headers: Record<string, string>) => v1Person(new Request("https://agent.equanime.rubrion.ai/v1/models", { headers }), env);

	it("maps each /v1 key to a person", () => {
		expect(v1({ authorization: "Bearer rubry-key", "x-equanime-person": "Visitor-42" })).toBe("rubry:visitor-42");
		expect(v1({ authorization: "Bearer rubry-key" })).toBeNull();
		expect(v1({ authorization: "Bearer owui-key", "x-openwebui-user-email": "Ana@USP.br" })).toBe("openwebui:ana@usp.br");
		expect(v1({ authorization: "Bearer owui-key" })).toBe("service:openwebui");
		expect(v1({ authorization: "Bearer wrong", "x-equanime-person": "x" })).toBeNull();
		expect(v1({})).toBeNull();
	});

	it("refuses /v1 without a key and hides the chat routes on the public host", async () => {
		expect((await SELF.fetch("https://agent.equanime.rubrion.ai/v1/models")).status).toBe(401);
		expect((await SELF.fetch("https://agent.equanime.rubrion.ai/agents", { headers: { "x-agent-person": "x" } })).status).toBe(404);
		const models = await SELF.fetch("https://agent.equanime.rubrion.ai/v1/models", { headers: { authorization: "Bearer owui-key" } });
		expect((await models.json<{ data: Array<{ id: string }> }>()).data.map((m) => m.id)).toEqual(["banca"]);
	});

	it("sends the person to equanime-api with the agent key", async () => {
		const mine = await asPerson("ana@usp.br", () => run(minhasAnalises, {}));
		expect((mine.analises as Array<{ candidato: string }>)[0].candidato).toBe("ana@usp.br");
	});
});

describe("consultar_analise", () => {
	it("keeps what the service decided and what is missing", async () => {
		const result = await asPerson("ana@usp.br", () => run(consultarAnalise, { analise: "a1" }));
		expect(result.sintese).toBe("Um possível conflito.");
		expect(result.curriculos_para_enviar).toEqual([{ nome: "Rita", lattes: "" }]);
		expect(result.avaliadores).toEqual([{ nome: "Rita", papel: "titular", resultado: "ANÁLISE INCONCLUSIVA", regras: [
			{ regra: "Coautoria", resultado: "Currículo não lido." },
			{ regra: "Projetos de pesquisa em conjunto", resultado: "Currículo não lido." },
		] }]);
		expect(result.pdf).toBe("https://equanime.test/api/analises/a1/relatorio.pdf");
	});

	it("reprocesses with the CVs attached in the chat", async () => {
		const result = await asPerson("ana@usp.br", () => run(reprocessarAnalise, { analise: "a1", curriculos: ["ref-1"] }));
		expect(result.analise).toBe("a1");
	});

	it("returns the API's message instead of throwing", async () => {
		expect(await asPerson("ana@usp.br", () => run(consultarAnalise, { analise: "missing" }))).toEqual({ error: "Análise não encontrada." });
	});
});
