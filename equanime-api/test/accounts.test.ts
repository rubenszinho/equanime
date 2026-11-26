import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { freeDomain } from "../src/accounts";
import { runAnalysis } from "../src/pipeline";

const secured = { ...env, AUTH_MODE: "accounts", WEB_KEY: "web-key", OTP_LOG: "1", FREE_DOMAINS: "usp.br", ADMINS: "chefe@usp.br", RETENTION_DAYS: "90" } as CloudflareBindings;
const app = createApp();

async function call(path: string, init: { method?: string; body?: unknown; session?: string; key?: string } = {}) {
	const ctx = createExecutionContext();
	const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${init.key ?? "web-key"}`, "x-equanime-net": "test-net" };
	if (init.session) headers["x-equanime-session"] = init.session;
	const response = await app.fetch(
		new Request(`https://equanime.test${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body ? JSON.stringify(init.body) : undefined }),
		secured,
		ctx,
	);
	await waitOnExecutionContext(ctx);
	return response;
}

// Codes are logged with OTP_LOG=1; the last one logged for an address.
const logged: string[] = [];
const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
afterEach(() => spy.mockClear());
function lastCode(email: string): string {
	const line = [...logged].reverse().find((item) => item.includes(`code for ${email}`));
	return line?.match(/([0-9]{6})$/)?.[1] ?? "";
}

async function account(email: string, name = "Pessoa Teste", password = "senha-segura") {
	const created = await call("/conta/acesso", { body: { action: "register", name, email, password } });
	expect(created.status).toBe(201);
	const { token } = await created.json<{ token: string }>();
	expect((await call("/conta", { body: { action: "verify", code: lastCode(email) }, session: token })).status).toBe(200);
	return token;
}

const board = (reviewers: number) => ({
	candidate: { name: "João da Silva", lattes_url: "http://lattes.cnpq.br/1111111111111111" },
	reviewers: Array.from({ length: reviewers }, (_, index) => ({ name: `Avaliador ${index}`, lattes_url: `http://lattes.cnpq.br/${String(3000000000000000 + index)}`, role: "titular" })),
});

describe("accounts", () => {
	it("knows the free institutions by domain and subdomain", () => {
		expect(freeDomain(secured, "ana@usp.br")).toBe("usp.br");
		expect(freeDomain(secured, "ana@icmc.usp.br")).toBe("usp.br");
		expect(freeDomain(secured, "ana@notusp.br")).toBeNull();
		expect(freeDomain(secured, "ana@usp.br.evil.com")).toBeNull();
		expect(freeDomain(secured, "ana@gmail.com")).toBeNull();
	});

	it("signs up, confirms by code, signs in and out", async () => {
		// Only the web app may sign people in.
		expect((await call("/conta/acesso", { body: { action: "login", email: "x@usp.br", password: "x" }, key: "wrong" })).status).toBe(401);
		const created = await call("/conta/acesso", { body: { action: "register", name: "Ana", email: "Ana@ICMC.usp.br", password: "senha-segura" } });
		const { token } = await created.json<{ token: string }>();
		// Unconfirmed: sees itself, nothing else.
		const unconfirmed = await (await call("/conta", { session: token })).json<{ confirmed: boolean; email: string }>();
		expect(unconfirmed).toMatchObject({ confirmed: false, email: "ana@icmc.usp.br" });
		expect((await call("/analises", { session: token })).status).toBe(403);
		expect((await call("/conta", { body: { action: "verify", code: "000000" }, session: token })).status).toBe(400);
		expect((await call("/conta", { body: { action: "verify", code: lastCode("ana@icmc.usp.br") }, session: token })).status).toBe(200);
		const me = await (await call("/conta", { session: token })).json<{ unlimited: boolean; institution: string; credits: number | null }>();
		expect(me).toMatchObject({ unlimited: true, institution: "usp.br", credits: null });
		expect((await call("/conta/acesso", { body: { action: "register", name: "Outra", email: "ana@icmc.usp.br", password: "outra-senha" } })).status).toBe(409);
		expect((await call("/conta/acesso", { body: { action: "login", email: "ana@icmc.usp.br", password: "errada-123" } })).status).toBe(401);
		const login = await call("/conta/acesso", { body: { action: "login", email: "ana@icmc.usp.br", password: "senha-segura" } });
		const second = (await login.json<{ token: string }>()).token;
		expect((await call("/conta", { body: { action: "logout" }, session: second })).status).toBe(200);
		expect((await call("/conta", { session: second })).status).toBe(401);
		expect((await call("/conta", { session: token })).status).toBe(200);
	});

	it("signs in with Google: creates a confirmed account, and takes over an unconfirmed one without its password", async () => {
		const google = await call("/conta/acesso", { body: { action: "google", email: "Gil@usp.br", name: "Gil Souza" } });
		expect(google.status).toBe(200);
		const { token } = await google.json<{ token: string }>();
		expect(await (await call("/conta", { session: token })).json()).toMatchObject({ email: "gil@usp.br", name: "Gil Souza", confirmed: true, unlimited: true, has_password: false });
		// No password matches a Google-only account.
		expect((await call("/conta/acesso", { body: { action: "login", email: "gil@usp.br", password: "google" } })).status).toBe(401);
		// Someone registered this email first but never confirmed it: Google's word wins, their password and session go.
		const squatter = await (await call("/conta/acesso", { body: { action: "register", name: "Outro", email: "hana@usp.br", password: "senha-do-outro" } })).json<{ token: string }>();
		expect((await call("/conta/acesso", { body: { action: "google", email: "hana@usp.br", name: "Hana" } })).status).toBe(200);
		expect((await call("/conta", { session: squatter.token })).status).toBe(401);
		expect((await call("/conta/acesso", { body: { action: "login", email: "hana@usp.br", password: "senha-do-outro" } })).status).toBe(401);
		// Deleting a Google-only account asks for APAGAR.
		expect((await call("/conta", { method: "DELETE", body: { password: "x" }, session: token })).status).toBe(401);
		expect((await call("/conta", { method: "DELETE", body: { password: "apagar" }, session: token })).status).toBe(200);
	});

	it("resets a password by code, signing out the other sessions", async () => {
		const token = await account("bia@usp.br");
		expect((await call("/conta/acesso", { body: { action: "forgot", email: "bia@usp.br" } })).status).toBe(200);
		// Unknown emails get the same answer.
		expect((await call("/conta/acesso", { body: { action: "forgot", email: "ninguem@usp.br" } })).status).toBe(200);
		expect((await call("/conta/acesso", { body: { action: "reset", email: "bia@usp.br", code: "123456", password: "nova-senha-1" } })).status).toBe(400);
		const reset = await call("/conta/acesso", { body: { action: "reset", email: "bia@usp.br", code: lastCode("bia@usp.br"), password: "nova-senha-1" } });
		expect(reset.status).toBe(200);
		expect((await call("/conta", { session: token })).status).toBe(401);
		expect((await call("/conta/acesso", { body: { action: "login", email: "bia@usp.br", password: "nova-senha-1" } })).status).toBe(200);
	});

	it("charges one credit per reviewer outside the free institutions, and refunds a failed analysis", async () => {
		const token = await account("carla@gmail.com");
		const admin = await account("chefe@usp.br");
		expect((await (await call("/conta", { session: token })).json<{ credits: number; unlimited: boolean }>())).toMatchObject({ credits: 0, unlimited: false });
		const refused = await call("/analises", { body: board(3), session: token });
		expect(refused.status).toBe(402);
		expect((await refused.json<{ message: string }>()).message).toContain("precisa de 3");
		// Only admins grant.
		expect((await call("/admin/creditos", { body: { email: "carla@gmail.com", credits: 5 }, session: token })).status).toBe(403);
		expect((await call("/admin/creditos", { body: { email: "carla@gmail.com", credits: 5, note: "piloto" }, session: admin })).status).toBe(200);
		const created = await call("/analises", { body: board(3), session: token });
		expect(created.status).toBe(202);
		const { analysis_id, expires_at, created_at } = await created.json<{ analysis_id: string; expires_at: string; created_at: string }>();
		expect(new Date(expires_at).getTime() - new Date(created_at).getTime()).toBe(90 * 24 * 60 * 60 * 1000);
		expect((await call("/analises", { body: board(3), session: token })).status).toBe(402);
		const after = await (await call("/conta", { session: token })).json<{ credits: number; history: Array<{ kind: string; n: number }> }>();
		expect(after.credits).toBe(2);
		expect(after.history.map((item) => [item.kind, item.n])).toEqual(expect.arrayContaining([["grant", 5], ["charge", -3]]));
		// A run that fails gives the credits back, once.
		await secured.DB.prepare("DELETE FROM participants WHERE analysis_id = ?").bind(analysis_id).run();
		const broken = { ...secured, EVIDENCE: { ...secured.EVIDENCE, put: () => Promise.reject(new Error("r2 down")) } } as unknown as CloudflareBindings;
		await runAnalysis(broken, analysis_id);
		await runAnalysis(broken, analysis_id);
		const status = await (await call(`/analises/${analysis_id}`, { session: token })).json<{ status: string }>();
		expect(status.status).toBe("failed");
		expect((await (await call("/conta", { session: token })).json<{ credits: number }>()).credits).toBe(5);
		// Free institutions never spend.
		expect((await call("/analises", { body: board(4), session: admin })).status).toBe(202);
		const users = await (await call("/admin/usuarios", { session: admin })).json<{ users: Array<{ email: string; credits: number; institution: string | null }> }>();
		expect(users.users.find((item) => item.email === "carla@gmail.com")).toMatchObject({ credits: 5, institution: null });
	});

	it("lists a person's analyses with their deletion date, and deletes everything with the account", async () => {
		const token = await account("dora@usp.br");
		const { analysis_id } = await (await call("/analises", { body: board(1), session: token })).json<{ analysis_id: string }>();
		const list = await (await call("/analises", { session: token })).json<{ analyses: Array<{ analysis_id: string; expires_at: string }> }>();
		expect(list.analyses.map((item) => item.analysis_id)).toEqual([analysis_id]);
		expect(list.analyses[0].expires_at).toBeTruthy();
		expect((await call("/conta", { method: "DELETE", body: { password: "errada-123" }, session: token })).status).toBe(401);
		expect((await call("/conta", { method: "DELETE", body: { password: "senha-segura" }, session: token })).status).toBe(200);
		expect(await secured.DB.prepare("SELECT COUNT(*) AS n FROM analyses WHERE actor = 'dora@usp.br'").first("n")).toBe(0);
		expect((await call("/conta", { session: token })).status).toBe(401);
	});
});
