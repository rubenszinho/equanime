import type { Curriculum } from "./domain";
import { envString } from "./settings";

export type CollectionInput = { name: string; lattesUrl: string; lattesId: string };

export interface CollectorProvider {
	submit(input: CollectionInput): Promise<{ jobId: string }>;
	status(jobId: string): Promise<{ done: boolean; curriculum?: Curriculum; error?: string }>;
}

const now = () => new Date().toISOString();

function curriculum(input: CollectionInput, extra: Partial<Curriculum>): Curriculum {
	return {
		requested_name: input.name,
		detected_name: input.name,
		lattes_id: input.lattesId,
		lattes_url: input.lattesUrl,
		consulted_at: now(),
		collection_status: "complete",
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
	const id = input.lattesId;
	if (id === "0000000000000000") {
		return curriculum(input, {
			detected_name: null,
			collection_status: "failed",
			error_type: "temporary_unavailable",
			error_message: "Indisponibilidade temporária da Plataforma Lattes.",
			consulted_at: now(),
		});
	}
	if (id === "7777777777777777") {
		return curriculum(input, {
			collection_status: "partial",
			warnings: [{ code: "partial_curriculum", message: "Currículo parcialmente recuperado." }],
			publications: [],
		});
	}
	if (id === "1111111111111111") {
		return curriculum(input, {
			publications: [{
				title: "Métodos de Inteligência Artificial para políticas públicas",
				year: 2024,
				authors: ["João da Silva", "Carlos Pereira"],
				source_record: "Publicação 2024 — Métodos de Inteligência Artificial para políticas públicas",
			}],
			projects: [{
				title: "Projeto Alpha de métodos computacionais",
				period: "2023-2025",
				institution: "ICMC USP",
				participants: ["João da Silva", "Ana Santos"],
				source_record: "Projeto Alpha de métodos computacionais (2023-2025)",
			}],
		});
	}
	if (id === "2222222222222222") {
		return curriculum(input, {
			detected_name: "Maria Souza",
			advising: [
				{ advisee_name: "Pedro Oliveira", level: "doutorado", year: 2024, period: "2024", institution: "ICMC USP", source_record: "Orientação de doutorado de Pedro Oliveira (2024)" },
				{ advisee_name: "Lucas Antigo", level: "mestrado", year: 2018, period: "2018", institution: "ICMC USP", source_record: "Orientação de mestrado de Lucas Antigo (2018)" },
			],
		});
	}
	if (id === "3333333333333333") {
		return curriculum(input, {
			detected_name: "Carlos Pereira",
			publications: [{
				title: "Métodos de Inteligência Artificial para políticas públicas",
				year: 2024,
				authors: ["Carlos Pereira", "João da Silva"],
				source_record: "Publicação 2024 — Métodos de Inteligência Artificial para políticas públicas",
			}],
		});
	}
	if (id === "4444444444444444") {
		return curriculum(input, {
			detected_name: "Ana C. Santos",
			projects: [{
				title: "Projeto Alpha de métodos computacionais",
				period: "2023-2025",
				institution: "ICMC USP",
				participants: ["Ana C. Santos", "João da Silva"],
				source_record: "Projeto Alpha de métodos computacionais (2023-2025)",
			}],
		});
	}
	if (id === "5555555555555555") {
		return curriculum(input, { detected_name: "Pedro Oliveira" });
	}
	if (id === "8888888888888888") {
		return curriculum(input, { detected_name: "Nome Divergente do Currículo", warnings: [{ code: "name_mismatch", message: "Nome informado diferente do nome existente no currículo." }] });
	}
	return curriculum(input, { detected_name: input.name });
}

export function fixtureProvider(): CollectorProvider {
	return {
		async submit(input) {
			return { jobId: `fixture:${input.lattesId}:${encodeURIComponent(input.name)}:${encodeURIComponent(input.lattesUrl)}` };
		},
		async status(jobId) {
			const [, lattesId, name, url] = jobId.split(":");
			if (!lattesId || !name || !url) return { done: true, error: "Identificador de coleta inválido." };
			return { done: true, curriculum: fixtureCurriculum({ lattesId, name: decodeURIComponent(name), lattesUrl: decodeURIComponent(url) }) };
		},
	};
}

export function httpProvider(baseUrl: string, token: string): CollectorProvider {
	const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
	return {
		async submit(input) {
			const response = await fetch(new URL("/v1/collections", baseUrl), {
				method: "POST",
				headers,
				body: JSON.stringify({ name: input.name, lattes_url: input.lattesUrl }),
			});
			if (!response.ok) throw new Error(`collector_submit_${response.status}`);
			const body = await response.json<{ job_id: string }>();
			return { jobId: body.job_id };
		},
		async status(jobId) {
			const response = await fetch(new URL(`/v1/collections/${jobId}`, baseUrl), { headers });
			if (!response.ok) throw new Error(`collector_status_${response.status}`);
			const body = await response.json<{ status: string; curriculum?: Curriculum; error?: { message: string } }>();
			if (body.status === "completed" && body.curriculum) return { done: true, curriculum: body.curriculum };
			if (body.status === "failed") return { done: true, error: body.error?.message ?? "Falha na coleta." };
			return { done: false };
		},
	};
}

export function providerFor(env: CloudflareBindings): CollectorProvider {
	if (envString(env, "COLLECTOR_MODE") === "fixture") return fixtureProvider();
	return httpProvider(envString(env, "COLLECTOR_URL"), env.COLLECTOR_TOKEN ?? "");
}
