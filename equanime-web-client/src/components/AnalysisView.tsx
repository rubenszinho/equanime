import { useEffect, useState } from "react";
import type { AnalysisResponse } from "../lib/board";

const terminal = new Set(["completed", "completed_with_warnings", "failed"]);

export default function AnalysisView({ analysisId }: { analysisId: string }) {
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let timer = 0;
		async function load() {
			const response = await fetch(`/api/analises/${analysisId}`);
			if (!response.ok) {
				setError("Não foi possível consultar a análise.");
				return;
			}
			const body = await response.json() as AnalysisResponse;
			setAnalysis(body);
			if (!terminal.has(body.status)) timer = window.setTimeout(load, 3000);
		}
		void load();
		return () => window.clearTimeout(timer);
	}, [analysisId]);

	if (error) return <p className="error">{error}</p>;
	if (!analysis) return <p>Consultando a análise.</p>;
	return (
		<section className="grid">
			<article className="card">
				<p className="status">{analysis.status}</p>
				<h1>{analysis.type === "academic" ? "Banca acadêmica" : "Banca de concurso ou processo seletivo"}</h1>
				<p>{analysis.message}</p>
				{analysis.assistant_summary ? <p>{analysis.assistant_summary}</p> : null}
				{analysis.summary ? (
					<ul>
						<li>{analysis.summary.reviewers_analyzed} avaliadores analisados</li>
						<li>{analysis.summary.without_identified_conflict} sem conflito identificado</li>
						<li>{analysis.summary.potential_conflict} com possível conflito</li>
						<li>{analysis.summary.inconclusive} com análise inconclusiva</li>
					</ul>
				) : null}
				{analysis.report_url ? <p><a className="button" href={`/api${analysis.report_url}`}>Baixar relatório PDF</a></p> : null}
			</article>
			{analysis.reviewers.map((item) => (
				<article className="card" key={item.reviewer.lattes_url}>
					<h2>{item.reviewer.name}</h2>
					<p>{item.reviewer.role} · {item.status_label}</p>
					<p>Coleta: {item.reviewer.collection_status}</p>
					{Object.values(item.checks).map((check) => (
						<section key={check.result}>
							<p>{check.result}</p>
							<ul>{check.evidence.map((evidence) => <li key={evidence.record}>{evidence.record} {evidence.year_or_period ? `(${evidence.year_or_period})` : ""}</li>)}</ul>
						</section>
					))}
				</article>
			))}
			{analysis.limitations.length > 0 ? (
				<article className="card">
					<h2>Limitações</h2>
					<ul>{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
				</article>
			) : null}
		</section>
	);
}
