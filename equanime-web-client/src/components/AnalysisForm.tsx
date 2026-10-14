import { useEffect, useState } from "react";
import { validateBoard, type ReviewerInput } from "../lib/board";

const emptyReviewer = (): ReviewerInput => ({ name: "", lattes_url: "", role: "titular" });

export default function AnalysisForm() {
	const [candidateName, setCandidateName] = useState("");
	const [candidateUrl, setCandidateUrl] = useState("");
	const [advisorName, setAdvisorName] = useState("");
	const [advisorUrl, setAdvisorUrl] = useState("");
	const [title, setTitle] = useState("");
	const [reviewers, setReviewers] = useState<ReviewerInput[]>([emptyReviewer(), emptyReviewer()]);
	const [errors, setErrors] = useState<string[]>([]);
	const [pending, setPending] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);

	async function submit(event: { preventDefault(): void }) {
		event.preventDefault();
		const advisor = advisorName || advisorUrl ? { name: advisorName, lattes_url: advisorUrl } : undefined;
		const input = {
			candidate: { name: candidateName, lattes_url: candidateUrl },
			advisor,
			work_title: title || undefined,
			reviewers,
		};
		const nextErrors = validateBoard(input);
		setErrors(nextErrors);
		if (nextErrors.length > 0) return;
		setPending(true);
		const response = await fetch("/api/analises", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		const body = await response.json() as { analysis_id?: string; message?: string };
		if (!response.ok || !body.analysis_id) {
			setErrors([body.message ?? "A análise não foi aceita."]);
			setPending(false);
			return;
		}
		window.location.assign(`/analises/${body.analysis_id}`);
	}

	return (
		<form className="grid" data-hydrated={hydrated ? "true" : "false"} onSubmit={submit}>
			<h2>Candidato</h2>
			<label>Nome<input aria-label="Nome do candidato" value={candidateName} onChange={(event) => setCandidateName(event.target.value)} /></label>
			<label>Currículo Lattes<input aria-label="Lattes do candidato" value={candidateUrl} onChange={(event) => setCandidateUrl(event.target.value)} /></label>
			<h2>Orientador e título</h2>
			<p className="muted">Opcionais. Sem orientador, a análise segue como concurso ou processo seletivo.</p>
			<label>Nome do orientador<input aria-label="Nome do orientador" value={advisorName} onChange={(event) => setAdvisorName(event.target.value)} /></label>
			<label>Lattes do orientador<input aria-label="Lattes do orientador" value={advisorUrl} onChange={(event) => setAdvisorUrl(event.target.value)} /></label>
			<label>Título do trabalho<input aria-label="Título do trabalho" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
			<h2>Avaliadores</h2>
			{reviewers.map((reviewer, index) => (
				<div className="row" key={index}>
					<label>Nome<input aria-label={`Nome do avaliador ${index + 1}`} value={reviewer.name} onChange={(event) => update(index, { name: event.target.value })} /></label>
					<label>Lattes<input aria-label={`Lattes do avaliador ${index + 1}`} value={reviewer.lattes_url} onChange={(event) => update(index, { lattes_url: event.target.value })} /></label>
					<label>Papel
						<select aria-label={`Papel do avaliador ${index + 1}`} value={reviewer.role} onChange={(event) => update(index, { role: event.target.value as ReviewerInput["role"] })}>
							<option value="titular">Titular</option>
							<option value="suplente">Suplente</option>
						</select>
					</label>
					<button type="button" onClick={() => setReviewers(reviewers.filter((_, item) => item !== index))}>Remover</button>
				</div>
			))}
			<button type="button" onClick={() => setReviewers([...reviewers, emptyReviewer()])}>Adicionar avaliador</button>
			{errors.map((error) => <p className="error" key={error}>{error}</p>)}
			<button type="submit" disabled={pending}>{pending ? "Enviando" : "Analisar banca"}</button>
		</form>
	);

	function update(index: number, patch: Partial<ReviewerInput>) {
		setReviewers(reviewers.map((reviewer, item) => item === index ? { ...reviewer, ...patch } : reviewer));
	}
}
