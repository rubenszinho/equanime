import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import regularFont from "./fonts/PublicSans-Regular.ttf";
import boldFont from "./fonts/PublicSans-Bold.ttf";
import type { AnalysisType, Evidence, ResultStatus, ReviewerChecks, RuleCheck } from "./domain";

export type ReportParticipant = { name: string; lattesUrl: string };
export type ReportReviewer = {
	name: string;
	lattesUrl: string;
	role: "titular" | "suplente";
	checks: ReviewerChecks;
	status: ResultStatus;
	conclusion: string;
};

export type ReportInput = {
	analysisId: string;
	type: AnalysisType;
	workTitle: string | null;
	candidate: ReportParticipant;
	advisor: ReportParticipant | null;
	reviewers: ReportReviewer[];
	limitations: string[];
	consultedAt: string;
};

const WIDTH = 595;
const HEIGHT = 842;
const MARGIN = 56;
const INK = rgb(0.086, 0.125, 0.169);
const SOFT = rgb(0.36, 0.4, 0.45);
const HAIR = rgb(0.85, 0.86, 0.88);
const RESULT: Record<ResultStatus, RGB> = {
	no_conflict_identified: rgb(0.12, 0.42, 0.29),
	potential_conflict: rgb(0.66, 0.2, 0.12),
	inconclusive: rgb(0.55, 0.42, 0.08),
};

function brazilDate(iso: string): string {
	return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export async function renderReport(input: ReportInput): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	doc.setTitle(`Análise de conflito de interesses — ${input.candidate.name}`);
	doc.setAuthor("Equânime");
	doc.setCreator("Equânime");
	const font = await doc.embedFont(regularFont, { subset: true });
	const bold = await doc.embedFont(boldFont, { subset: true });
	// Lattes data can hold characters the font lacks (CJK, math); they print as "?" instead of failing the report.
	const known = new Set(font.getCharacterSet());
	const clean = (text: string) => [...text.normalize("NFC")].map((char) => (known.has(char.codePointAt(0)!) ? char : char === "\n" ? " " : "?")).join("");

	let page: PDFPage = doc.addPage([WIDTH, HEIGHT]);
	let y = HEIGHT - MARGIN;
	const room = (needed: number) => {
		if (y - needed >= MARGIN + 24) return;
		page = doc.addPage([WIDTH, HEIGHT]);
		y = HEIGHT - MARGIN;
	};
	const text = (value: string, options: { size?: number; font?: PDFFont; color?: RGB; indent?: number; gap?: number } = {}) => {
		const size = options.size ?? 10;
		const face = options.font ?? font;
		const indent = options.indent ?? 0;
		for (const line of wrap(clean(value), face, size, WIDTH - MARGIN * 2 - indent)) {
			room(size + 4);
			page.drawText(line, { x: MARGIN + indent, y: y - size, size, font: face, color: options.color ?? INK });
			y -= size + 4;
		}
		y -= options.gap ?? 0;
	};
	const heading = (value: string) => {
		room(40);
		y -= 10;
		text(value.toUpperCase(), { size: 9, font: bold, color: SOFT, gap: 4 });
		page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: WIDTH - MARGIN, y: y + 2 }, thickness: 0.5, color: HAIR });
		y -= 8;
	};
	const person = (label: string, who: ReportParticipant) => {
		text(`${label}: ${who.name}`, { font: bold });
		text(`Currículo Lattes: ${who.lattesUrl}`, { size: 9, color: SOFT, gap: 4 });
	};
	const badge = (status: ResultStatus, label: string) => {
		const size = 8.5;
		const width = bold.widthOfTextAtSize(label, size) + 14;
		room(20);
		page.drawRectangle({ x: MARGIN, y: y - 16, width, height: 16, color: RESULT[status], opacity: 0.12, borderColor: RESULT[status], borderWidth: 0.6 });
		page.drawText(label, { x: MARGIN + 7, y: y - 11.5, size, font: bold, color: RESULT[status] });
		y -= 24;
	};
	const check = (title: string, rule: RuleCheck) => {
		const status: ResultStatus = rule.detected ? "potential_conflict" : rule.inconclusive ? "inconclusive" : "no_conflict_identified";
		room(34);
		text(title, { font: bold, indent: 10 });
		text(`Resultado: ${rule.result}`, { indent: 10, color: rule.detected || rule.inconclusive ? RESULT[status] : INK });
		if (rule.evidence.length === 0) {
			text("Evidências: nenhuma registrada.", { size: 9, color: SOFT, indent: 10, gap: 4 });
			return;
		}
		text("Evidências:", { size: 9, font: bold, indent: 10 });
		for (const item of rule.evidence) for (const line of evidenceLines(item)) text(line, { size: 9, indent: line.startsWith("•") ? 18 : 28 });
		y -= 4;
	};

	// Header
	page.drawRectangle({ x: 0, y: HEIGHT - 6, width: WIDTH, height: 6, color: INK });
	text("EQUÂNIME", { size: 9, font: bold, color: SOFT, gap: 6 });
	text("ANÁLISE DE CONFLITO DE INTERESSES", { size: 17, font: bold, gap: 2 });
	text(input.type === "academic" ? "Banca de Mestrado ou Doutorado" : "Banca de Concurso ou Processo Seletivo", { size: 12, color: SOFT, gap: 6 });
	if (input.workTitle) text(`Título da tese ou dissertação: ${input.workTitle}`, { gap: 2 });
	text(`Análise ${input.analysisId} · Data da consulta: ${brazilDate(input.consultedAt)}`, { size: 8.5, color: SOFT, gap: 4 });

	heading("Candidato");
	person("Nome", input.candidate);
	if (input.advisor) {
		heading("Orientador");
		person("Nome", input.advisor);
	}

	heading(input.type === "academic" ? "Banca" : "Avaliadores");
	if (input.type === "academic") {
		for (const role of ["titular", "suplente"] as const) {
			const group = input.reviewers.filter((item) => item.role === role);
			if (group.length === 0) continue;
			text(role === "titular" ? "Titulares" : "Suplentes", { size: 9, font: bold, color: SOFT, gap: 2 });
			for (const reviewer of group) person("Nome", reviewer);
		}
	} else {
		for (const reviewer of input.reviewers) person("Nome", reviewer);
	}

	heading("Análise de conflito de interesses");
	for (const reviewer of input.reviewers) {
		room(90);
		y -= 4;
		text(`Avaliador: ${reviewer.name}`, { size: 11.5, font: bold });
		text(input.type === "academic" ? (reviewer.role === "titular" ? "Titular" : "Suplente") : "Avaliador", { size: 9, color: SOFT, gap: 4 });
		badge(reviewer.status, reviewer.conclusion);
		check("Coautoria com o candidato", reviewer.checks.coauthorship);
		if (input.type === "academic") check("Relação recente com o orientador", reviewer.checks.recent_advisor_relationship);
		check("Participação conjunta em projetos de pesquisa", reviewer.checks.joint_research_projects);
		text(`Conclusão: ${reviewer.conclusion}`, { font: bold, color: RESULT[reviewer.status], gap: 8 });
	}

	heading("Conclusão");
	const count = (status: ResultStatus) => input.reviewers.filter((item) => item.status === status).length;
	text(`${input.reviewers.length} avaliador(es) analisado(s): ${count("no_conflict_identified")} sem conflito identificado, ${count("potential_conflict")} com possível conflito identificado, ${count("inconclusive")} com análise inconclusiva.`, { gap: 4 });
	text("Este relatório é apoio à decisão. Indica apenas o que foi identificado nas fontes consultadas; a ausência de evidência no Currículo Lattes não comprova a inexistência de conflito. A composição da banca deve ser conferida por uma pessoa.", { size: 9, color: SOFT });

	heading("Limitações da análise");
	if (input.limitations.length === 0) text("Nenhuma limitação registrada.", { color: SOFT });
	for (const limitation of input.limitations) text(`• ${limitation}`, { size: 9.5 });

	heading("Data da consulta");
	text(brazilDate(input.consultedAt));

	const pages = doc.getPages();
	pages.forEach((item, index) => {
		const label = `Equânime · ${input.analysisId} · página ${index + 1} de ${pages.length}`;
		item.drawText(label, { x: MARGIN, y: 28, size: 7.5, font, color: SOFT });
	});
	return doc.save();
}

function evidenceLines(item: Evidence): string[] {
	const lines = [`• ${item.publication ?? item.project ?? item.orientation_type ?? item.record}${item.year_or_period ? ` (${item.year_or_period})` : ""}`];
	if (item.orientation_type) lines.push(`Tipo: ${item.orientation_type}`);
	if (item.authors?.length) lines.push(`Autores: ${item.authors.join("; ")}`);
	if (item.institution) lines.push(`Instituição: ${item.institution}`);
	lines.push(`Pessoas: ${item.people.join(" e ")}`);
	lines.push(`Registro: ${item.record}`);
	lines.push(`Fonte: ${item.source_curriculum}${item.consulted_at ? `, consultado em ${brazilDate(item.consulted_at)}` : ""}`);
	if (item.confidence === "medium") lines.push("Identificação por semelhança de nome ou título: conferir.");
	return lines;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/)) {
		const next = current ? `${current} ${word}` : word;
		if (font.widthOfTextAtSize(next, size) <= width) {
			current = next;
			continue;
		}
		if (current) lines.push(current);
		// A URL or ID longer than the line is cut where it overflows.
		let rest = word;
		while (font.widthOfTextAtSize(rest, size) > width) {
			let cut = rest.length - 1;
			while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
			lines.push(rest.slice(0, cut));
			rest = rest.slice(cut);
		}
		current = rest;
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}
