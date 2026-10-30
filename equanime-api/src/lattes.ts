import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import type { AdvisingRecord, Curriculum, ProjectRecord, PublicationRecord, TrainingRecord } from "./domain";

// Parses the XML that the Lattes platform exports (the "XML" button on a CV, or CNPq's
// institutional extractor). Elements are walked generically: the schema has dozens of
// production types that share DADOS-BASICOS-* / AUTORES / DETALHAMENTO-* children.

type Node = { [key: string]: unknown };

export class LattesParseError extends Error {}

const LEVELS: Record<string, string> = {
	MESTRADO: "mestrado",
	"MESTRADO-PROFISSIONALIZANTE": "mestrado",
	DOUTORADO: "doutorado",
	"POS-DOUTORADO": "pos_doutorado",
};

const KINDS: Record<string, string> = {
	"ARTIGO-PUBLICADO": "Artigo",
	"ARTIGO-ACEITO-PARA-PUBLICACAO": "Artigo aceito",
	"TRABALHO-EM-EVENTOS": "Trabalho em evento",
	"LIVRO-PUBLICADO-OU-ORGANIZADO": "Livro",
	"CAPITULO-DE-LIVRO-PUBLICADO": "Capítulo de livro",
	"TEXTO-EM-JORNAL-OU-REVISTA": "Texto em jornal ou revista",
};

export function decodeLattes(bytes: Uint8Array): string {
	// The export is often a ZIP holding curriculo.xml.
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		const files = unzipSync(bytes);
		const name = Object.keys(files).find((item) => item.toLowerCase().endsWith(".xml"));
		if (!name) throw new LattesParseError("O arquivo ZIP não contém um XML do Lattes.");
		bytes = files[name];
	}
	const head = String.fromCharCode(...bytes.subarray(0, 200));
	// Lattes writes ISO-8859-1; each byte is the code point.
	if (/encoding=["'](iso-8859-1|latin-?1|windows-1252)["']/i.test(head)) {
		let text = "";
		for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
		return text;
	}
	return new TextDecoder().decode(bytes);
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@",
	parseAttributeValue: false,
	parseTagValue: false,
	isArray: (_name, _path, _leaf, isAttribute) => !isAttribute,
});

function attr(node: Node, name: string): string {
	const value = node[`@${name}`];
	return typeof value === "string" ? value.trim() : "";
}

function attrStarting(node: Node, prefix: string, exclude = /INGLES/): string {
	const key = Object.keys(node).find((item) => item.startsWith(`@${prefix}`) && !exclude.test(item));
	return key ? attr(node, key.slice(1)) : "";
}

function children(node: Node, tag: string): Node[] {
	const value = node[tag];
	return Array.isArray(value) ? value.filter((item): item is Node => typeof item === "object" && item !== null) : [];
}

function childStarting(node: Node, prefix: string): Node | null {
	const key = Object.keys(node).find((item) => item.startsWith(prefix));
	return key ? children(node, key)[0] ?? null : null;
}

function year(value: string): number | null {
	const match = value.match(/[0-9]{4}/);
	return match ? Number(match[0]) : null;
}

function* walk(node: Node, ancestors: Array<[string, Node]> = []): Generator<[string, Node, Array<[string, Node]>]> {
	for (const key of Object.keys(node)) {
		if (key.startsWith("@") || key === "#text") continue;
		for (const child of children(node, key)) {
			yield [key, child, ancestors];
			yield* walk(child, [...ancestors, [key, child]]);
		}
	}
}

function lattesDate(value: string): string | null {
	const match = value.match(/^([0-9]{2})([0-9]{2})([0-9]{4})$/);
	return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function parseLattesXml(xml: string, input: { name: string; lattesUrl: string; consultedAt: string; source: Curriculum["source"] }): Curriculum {
	let doc: Node;
	try {
		doc = parser.parse(xml) as Node;
	} catch {
		throw new LattesParseError("O arquivo não é um XML válido.");
	}
	const root = children(doc, "CURRICULO-VITAE")[0];
	if (!root) throw new LattesParseError("O arquivo não é um currículo Lattes (CURRICULO-VITAE ausente).");
	const lattesId = attr(root, "NUMERO-IDENTIFICADOR");
	if (!/^[0-9]{16}$/.test(lattesId)) throw new LattesParseError("O currículo não traz o identificador Lattes de 16 dígitos.");
	const general = children(root, "DADOS-GERAIS")[0] ?? {};
	const detected = attr(general, "NOME-COMPLETO") || null;
	const aliases = attr(general, "NOME-EM-CITACOES-BIBLIOGRAFICAS").split(";").map((item) => item.trim()).filter(Boolean);

	const publications: PublicationRecord[] = [];
	const projects = new Map<string, ProjectRecord>();
	const advising: AdvisingRecord[] = [];
	const training: TrainingRecord[] = [];

	for (const [tag, node, ancestors] of walk(root)) {
		const path = ancestors.map(([name]) => name);
		if (path.includes("PRODUCAO-BIBLIOGRAFICA") && node["AUTORES"]) {
			const basics = childStarting(node, "DADOS-BASICOS");
			if (!basics) continue;
			const title = attrStarting(basics, "TITULO");
			if (!title) continue;
			const published = year(attrStarting(basics, "ANO"));
			const authors = children(node, "AUTORES")
				.sort((a, b) => Number(attr(a, "ORDEM-DE-AUTORIA")) - Number(attr(b, "ORDEM-DE-AUTORIA")));
			const kind = KINDS[tag] ?? "Publicação";
			publications.push({
				title,
				year: published,
				authors: authors.map((item) => attr(item, "NOME-COMPLETO-DO-AUTOR") || attr(item, "NOME-PARA-CITACAO")).filter(Boolean),
				author_ids: authors.map((item) => attr(item, "NRO-ID-CNPQ")).filter((id) => /^[0-9]{16}$/.test(id)),
				source_record: `${kind}${published ? ` ${published}` : ""} — ${title}`,
			});
		} else if (tag === "PROJETO-DE-PESQUISA") {
			const nature = attr(node, "NATUREZA");
			if (nature && nature !== "PESQUISA") continue;
			const title = attr(node, "NOME-DO-PROJETO");
			if (!title || projects.has(title)) continue;
			const start = attr(node, "ANO-INICIO");
			const end = attr(node, "ANO-FIM");
			const period = start ? `${start}–${end || "atual"}` : null;
			const job = [...ancestors].reverse().find(([name]) => name === "ATUACAO-PROFISSIONAL")?.[1];
			const members = children(node, "EQUIPE-DO-PROJETO").flatMap((team) => children(team, "INTEGRANTES-DO-PROJETO"));
			projects.set(title, {
				title,
				period,
				institution: job ? attr(job, "NOME-INSTITUICAO") || null : null,
				participants: members.map((item) => attr(item, "NOME-COMPLETO")).filter(Boolean),
				participant_ids: members.map((item) => attr(item, "NRO-ID-CNPQ")).filter((id) => /^[0-9]{16}$/.test(id)),
				source_record: `Projeto de pesquisa${period ? ` (${period})` : ""} — ${title}`,
			});
		} else if (/^ORIENTACOES-CONCLUIDAS-PARA-(MESTRADO|DOUTORADO|POS-DOUTORADO)$/.test(tag)) {
			const level = LEVELS[tag.replace("ORIENTACOES-CONCLUIDAS-PARA-", "")];
			const basics = childStarting(node, "DADOS-BASICOS") ?? {};
			const detail = childStarting(node, "DETALHAMENTO") ?? {};
			const name = attr(detail, "NOME-DO-ORIENTADO");
			if (!name) continue;
			const done = year(attr(basics, "ANO"));
			advising.push({
				advisee_name: name,
				advisee_id: attr(detail, "NUMERO-ID-ORIENTADO") || null,
				level,
				year: done,
				period: done ? String(done) : null,
				institution: attr(detail, "NOME-DA-INSTITUICAO") || null,
				source_record: `Orientação concluída de ${levelName(level)} de ${name}${done ? ` (${done})` : ""}`,
			});
		} else if (/^ORIENTACAO-EM-ANDAMENTO-DE-(MESTRADO|DOUTORADO|POS-DOUTORADO)$/.test(tag)) {
			const level = LEVELS[tag.replace("ORIENTACAO-EM-ANDAMENTO-DE-", "")];
			const basics = childStarting(node, "DADOS-BASICOS") ?? {};
			const detail = childStarting(node, "DETALHAMENTO") ?? {};
			const name = attr(detail, "NOME-DO-ORIENTANDO");
			if (!name) continue;
			const start = year(attr(basics, "ANO"));
			advising.push({
				advisee_name: name,
				advisee_id: attr(detail, "NUMERO-ID-ORIENTANDO") || null,
				level,
				year: null,
				period: `${start ?? "?"}–atual`,
				ongoing: true,
				institution: attr(detail, "NOME-INSTITUICAO") || null,
				source_record: `Orientação em andamento de ${levelName(level)} de ${name} (desde ${start ?? "data não informada"})`,
			});
		} else if (path.at(-1) === "FORMACAO-ACADEMICA-TITULACAO" && LEVELS[tag]) {
			const level = LEVELS[tag];
			const advisor = attr(node, "NOME-COMPLETO-DO-ORIENTADOR") || attr(node, "NOME-DO-ORIENTADOR") || null;
			const start = attr(node, "ANO-DE-INICIO");
			const end = attr(node, "ANO-DE-CONCLUSAO");
			const ongoing = attr(node, "STATUS-DO-CURSO") === "EM_ANDAMENTO" || (!end && Boolean(start));
			training.push({
				level,
				advisor_name: advisor,
				advisor_id: attr(node, "NUMERO-ID-ORIENTADOR") || null,
				year: year(end),
				period: start ? `${start}–${end || "atual"}` : end || null,
				ongoing,
				institution: attr(node, "NOME-INSTITUICAO") || null,
				source_record: `Formação: ${levelName(level)}${attr(node, "NOME-INSTITUICAO") ? ` em ${attr(node, "NOME-INSTITUICAO")}` : ""}${advisor ? `, orientação de ${advisor}` : ""}${start ? ` (${start}–${end || "atual"})` : ""}`,
			});
		}
	}

	return {
		requested_name: input.name,
		detected_name: detected,
		lattes_id: lattesId,
		lattes_url: input.lattesUrl,
		consulted_at: input.consultedAt,
		source: input.source,
		aliases,
		lattes_updated_at: lattesDate(attr(root, "DATA-ATUALIZACAO")),
		collection_status: "complete",
		error_type: null,
		error_message: null,
		warnings: [],
		publications,
		projects: [...projects.values()],
		advising,
		training,
	};
}

export function levelName(level: string): string {
	return level === "mestrado" ? "mestrado" : level === "doutorado" ? "doutorado" : "pós-doutorado";
}
