import fixtures from "../../fixtures/curricula.json";
import type { CollectionStatus, Curriculum } from "./domain";
import { decodeLattes } from "./lattes";
import { envString } from "./settings";

export type CollectionInput = { name: string; lattesUrl: string; lattesId: string };

// A finished collection carries either a parsed CV (fixtures) or the Lattes XML
// (the institutional extractor), which the API parses with the same code as uploads.
export type CollectionResult =
	| { done: false }
	| { done: true; curriculum: Curriculum }
	| { done: true; xml: string }
	| { done: true; error: { type: string; message: string } };

export interface CollectorProvider {
	submit(input: CollectionInput): Promise<{ jobId: string }>;
	status(jobId: string): Promise<CollectionResult>;
}

export function blankCurriculum(input: CollectionInput, status: CollectionStatus, extra: Partial<Curriculum> = {}): Curriculum {
	return {
		requested_name: input.name,
		detected_name: input.name,
		lattes_id: input.lattesId,
		lattes_url: input.lattesUrl,
		consulted_at: new Date().toISOString(),
		collection_status: status,
		error_type: null,
		error_message: null,
		warnings: [],
		publications: [],
		projects: [],
		advising: [],
		...extra,
	};
}

export function fixtureCurriculum(input: CollectionInput): Curriculum {
	const entry = (fixtures as Record<string, Partial<Curriculum>>)[input.lattesId] ?? {};
	return blankCurriculum(input, "complete", { source: "fixture", ...entry });
}

export function fixtureProvider(): CollectorProvider {
	return {
		async submit(input) {
			return { jobId: `fixture:${input.lattesId}:${encodeURIComponent(input.name)}:${encodeURIComponent(input.lattesUrl)}` };
		},
		async status(jobId) {
			const [, lattesId, name, url] = jobId.split(":");
			if (!lattesId || !name || !url) return { done: true, error: { type: "invalid_job", message: "Identificador de coleta inválido." } };
			return { done: true, curriculum: fixtureCurriculum({ lattesId, name: decodeURIComponent(name), lattesUrl: decodeURIComponent(url) }) };
		},
	};
}

// new URL("/x", base) drops the base's path; join relative to a base that ends in "/".
export function under(base: string, path: string): URL {
	return new URL(path, base.endsWith("/") ? base : `${base}/`);
}

export function httpProvider(baseUrl: string, token: string, access?: { id: string; secret: string }): CollectorProvider {
	const headers: Record<string, string> = { authorization: `Bearer ${token}`, "content-type": "application/json" };
	// The collector's hostname sits behind Cloudflare Access; the API passes its service token.
	if (access) {
		headers["cf-access-client-id"] = access.id;
		headers["cf-access-client-secret"] = access.secret;
	}
	return {
		async submit(input) {
			const response = await fetch(under(baseUrl, "v1/collections"), {
				method: "POST",
				headers,
				body: JSON.stringify({ name: input.name, lattes_url: input.lattesUrl }),
			});
			if (!response.ok) throw new Error(`collector_submit_${response.status}`);
			const body = await response.json<{ job_id: string }>();
			return { jobId: body.job_id };
		},
		async status(jobId) {
			const response = await fetch(under(baseUrl, `v1/collections/${encodeURIComponent(jobId)}`), { headers });
			if (!response.ok) throw new Error(`collector_status_${response.status}`);
			const body = await response.json<{ status: string; curriculum?: Curriculum; xml_base64?: string; error?: { type?: string; message?: string } }>();
			if (body.status === "completed" && body.xml_base64) {
				const bytes = Uint8Array.from(atob(body.xml_base64), (char) => char.charCodeAt(0));
				return { done: true, xml: decodeLattes(bytes) };
			}
			if (body.status === "completed" && body.curriculum) return { done: true, curriculum: body.curriculum };
			if (body.status === "failed") return { done: true, error: { type: body.error?.type ?? "collection_failed", message: body.error?.message ?? "Falha na coleta." } };
			return { done: false };
		},
	};
}

export type CollectorMode = "fixture" | "http" | "upload";

export function collectorMode(env: CloudflareBindings): CollectorMode {
	const mode = envString(env, "COLLECTOR_MODE");
	return mode === "fixture" || mode === "http" ? mode : "upload";
}

export function providerFor(env: CloudflareBindings): CollectorProvider | null {
	const mode = collectorMode(env);
	if (mode === "fixture") return fixtureProvider();
	if (mode === "upload") return null;
	if (!env.COLLECTOR_TOKEN) throw new Error("collector_token_missing");
	const accessId = envString(env, "COLLECTOR_ACCESS_ID");
	const access = accessId && env.COLLECTOR_ACCESS_SECRET ? { id: accessId, secret: env.COLLECTOR_ACCESS_SECRET } : undefined;
	return httpProvider(envString(env, "COLLECTOR_URL"), env.COLLECTOR_TOKEN, access);
}
