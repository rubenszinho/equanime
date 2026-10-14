import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AnalysisType, ReviewerChecks } from "./domain";

export type ReportParticipant = { name: string; lattesUrl: string; role?: "titular" | "suplente" };
export type ReportReviewer = { name: string; role: "titular" | "suplente"; checks: ReviewerChecks; conclusion: string };

export type ReportInput = {
	type: AnalysisType;
	workTitle: string | null;
	candidate: ReportParticipant;
	advisor: ReportParticipant | null;
	reviewers: ReportReviewer[];
	limitations: string[];
	consultedAt: string;
};

function ascii(value: string): string {
	return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export async function renderReport(input: ReportInput): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	let page = doc.addPage([595, 842]);
	let y = 800;
	const draw = (text: string, options: { size?: number; strong?: boolean } = {}) => {
		const size = options.size ?? 11;
		const lines = wrap(ascii(text), 90);
		for (const line of lines) {
			if (y < 60) {
				page = doc.addPage([595, 842]);
				y = 800;
			}
			page.drawText(line, { x: 48, y, size, font: options.strong ? bold : font, color: rgb(0.1, 0.12, 0.1) });
			y -= size + 5;
		}
	};
	draw("ANALISE DE CONFLITO DE INTERESSES", { size: 16, strong: true });
	y -= 6;
	draw(input.type === "academic" ? "Banca de Mestrado ou Doutorado" : "Banca de Concurso ou Processo Seletivo", { strong: true });
	if (input.workTitle) draw(`Titulo da tese ou dissertacao: ${input.workTitle}`);
	draw(`Candidato: ${input.candidate.name}`);
	draw(`Curriculo Lattes: ${input.candidate.lattesUrl}`);
	if (input.advisor) {
		draw(`Orientador: ${input.advisor.name}`);
		draw(`Curriculo Lattes: ${input.advisor.lattesUrl}`);
	}
	y -= 8;
	draw(input.type === "academic" ? "Banca" : "Avaliadores", { strong: true });
	for (const reviewer of input.reviewers) {
		const group = input.type === "academic" ? (reviewer.role === "titular" ? "Titular" : "Suplente") : "Avaliador";
		draw(`${group}: ${reviewer.name}`);
	}
	y -= 8;
	draw("Analise de conflito de interesses", { strong: true });
	for (const reviewer of input.reviewers) {
		y -= 4;
		draw(`Avaliador: ${reviewer.name}`, { strong: true });
		draw(`Coautoria com o candidato: ${reviewer.checks.coauthorship.result}`);
		for (const item of reviewer.checks.coauthorship.evidence) draw(`Evidencia: ${item.publication ?? item.record} (${item.year_or_period ?? "periodo nao informado"}) — ${item.source_curriculum}`);
		if (input.type === "academic") {
			draw(`Relacao recente com o orientador: ${reviewer.checks.recent_advisor_relationship.result}`);
			for (const item of reviewer.checks.recent_advisor_relationship.evidence) draw(`Evidencia: ${item.orientation_type ?? "Orientacao"} ${item.year_or_period ?? ""} — ${item.source_curriculum}`);
		}
		draw(`Participacao conjunta em projetos de pesquisa: ${reviewer.checks.joint_research_projects.result}`);
		for (const item of reviewer.checks.joint_research_projects.evidence) draw(`Evidencia: ${item.project ?? item.record} (${item.year_or_period ?? "periodo nao informado"}) — ${item.source_curriculum}`);
		draw(`Conclusao: ${reviewer.conclusion}`);
	}
	y -= 8;
	draw("Limitacoes da analise", { strong: true });
	for (const limitation of input.limitations) draw(`- ${limitation}`);
	draw(`Data da consulta: ${input.consultedAt}`);
	return doc.save();
}

function wrap(text: string, width: number): string[] {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length > width) {
			if (current) lines.push(current);
			current = word;
		} else current = next;
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}
