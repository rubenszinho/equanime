import { useEffect, useState } from "react";
import { form } from "../data/copy";
import { api } from "../lib/api";
import { validateBoard, type BoardInput, type FieldErrors, type ReviewerInput } from "../lib/board";

const emptyReviewer = (): ReviewerInput => ({ name: "", lattes_url: "", role: "titular" });

// The fixture board: the same people the API's local fixtures know.
const example = {
	candidate: { name: "João da Silva", lattes_url: "http://lattes.cnpq.br/1111111111111111" },
	advisor: { name: "Maria Souza", lattes_url: "http://lattes.cnpq.br/2222222222222222" },
	title: "Métodos de Inteligência Artificial para políticas públicas",
	reviewers: [
		{ name: "Carlos Pereira", lattes_url: "http://lattes.cnpq.br/3333333333333333", role: "titular" },
		{ name: "Ana Santos", lattes_url: "http://lattes.cnpq.br/4444444444444444", role: "titular" },
		{ name: "Pedro Oliveira", lattes_url: "http://lattes.cnpq.br/5555555555555555", role: "suplente" },
		{ name: "Clara Nunes", lattes_url: "http://lattes.cnpq.br/6666666666666666", role: "suplente" },
	] as ReviewerInput[],
};

export default function AnalysisForm({ showExample = false }: { showExample?: boolean }) {
	const [candidate, setCandidate] = useState({ name: "", lattes_url: "" });
	const [advisor, setAdvisor] = useState({ name: "", lattes_url: "" });
	const [title, setTitle] = useState("");
	const [reviewers, setReviewers] = useState<ReviewerInput[]>([emptyReviewer(), emptyReviewer()]);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [failure, setFailure] = useState("");
	const [pending, setPending] = useState(false);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);

	const academic = Boolean(advisor.name.trim() || advisor.lattes_url.trim());

	async function submit(event: { preventDefault(): void }) {
		event.preventDefault();
		const input: BoardInput = {
			candidate: { name: candidate.name.trim(), lattes_url: candidate.lattes_url.trim() },
			advisor: academic ? { name: advisor.name.trim(), lattes_url: advisor.lattes_url.trim() } : undefined,
			work_title: title.trim() || undefined,
			reviewers: reviewers.map((item) => ({ ...item, name: item.name.trim(), lattes_url: item.lattes_url.trim() })),
		};
		const found = validateBoard(input);
		setErrors(found);
		setFailure("");
		if (Object.keys(found).length > 0) {
			document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
			return;
		}
		setPending(true);
		const reply = await api<{ analysis_id: string }>("/analises", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!reply.ok) {
			setFailure(reply.message);
			setPending(false);
			return;
		}
		window.location.assign(`/analises/${reply.body.analysis_id}`);
	}

	function fillExample() {
		setCandidate(example.candidate);
		setAdvisor(example.advisor);
		setTitle(example.title);
		setReviewers(example.reviewers);
		setErrors({});
	}

	function update(index: number, patch: Partial<ReviewerInput>) {
		setReviewers(reviewers.map((reviewer, item) => (item === index ? { ...reviewer, ...patch } : reviewer)));
	}

	const invalid = (key: string) => (errors[key] ? { "aria-invalid": true as const, "aria-describedby": `${key}-error` } : {});
	const message = (key: string) => (errors[key] ? <span className="error" id={`${key}-error`}>{errors[key]}</span> : null);

	return (
		<form className="board-form" data-hydrated={hydrated ? "true" : "false"} onSubmit={submit} noValidate>
			{showExample ? <p><button type="button" className="btn btn--quiet btn--small" onClick={fillExample}>{form.example}</button></p> : null}

			<fieldset>
				<legend>{form.candidate}</legend>
				<div className="pair">
					<label className="field"><span>{form.name}</span>
						<input aria-label="Nome do candidato" autoComplete="off" value={candidate.name} onChange={(event) => setCandidate({ ...candidate, name: event.target.value })} {...invalid("candidate.name")} />
						{message("candidate.name")}
					</label>
					<label className="field"><span>{form.lattes}</span>
						<input aria-label="Lattes do candidato" inputMode="url" placeholder={form.lattesPlaceholder} value={candidate.lattes_url} onChange={(event) => setCandidate({ ...candidate, lattes_url: event.target.value })} {...invalid("candidate.lattes")} />
						{message("candidate.lattes")}
					</label>
				</div>
			</fieldset>

			<fieldset>
				<legend>{form.advisor}</legend>
				<p className="hint">{form.advisorHint}</p>
				<div className="pair">
					<label className="field"><span>{form.name}</span>
						<input aria-label="Nome do orientador" autoComplete="off" value={advisor.name} onChange={(event) => setAdvisor({ ...advisor, name: event.target.value })} {...invalid("advisor.name")} />
						{message("advisor.name")}
					</label>
					<label className="field"><span>{form.lattes}</span>
						<input aria-label="Lattes do orientador" inputMode="url" placeholder={form.lattesPlaceholder} value={advisor.lattes_url} onChange={(event) => setAdvisor({ ...advisor, lattes_url: event.target.value })} {...invalid("advisor.lattes")} />
						{message("advisor.lattes")}
					</label>
				</div>
				<label className="field"><span>{form.work}</span>
					<input aria-label="Título do trabalho" value={title} onChange={(event) => setTitle(event.target.value)} />
					<small>{form.workHint}</small>
				</label>
			</fieldset>

			<fieldset>
				<legend>{form.reviewers}</legend>
				<p className="hint">{form.reviewersHint}</p>
				<ol className="reviewers">
					{reviewers.map((reviewer, index) => (
						<li key={index}>
							<div className="pair">
								<label className="field"><span>{form.name}</span>
									<input aria-label={`Nome do avaliador ${index + 1}`} autoComplete="off" value={reviewer.name} onChange={(event) => update(index, { name: event.target.value })} {...invalid(`reviewers.${index}`)} />
								</label>
								<label className="field"><span>{form.lattes}</span>
									<input aria-label={`Lattes do avaliador ${index + 1}`} inputMode="url" placeholder={form.lattesPlaceholder} value={reviewer.lattes_url} onChange={(event) => update(index, { lattes_url: event.target.value })} {...invalid(`reviewers.${index}`)} />
								</label>
							</div>
							<div className="row">
								<div className="roles" role="radiogroup" aria-label={`Papel do avaliador ${index + 1}`}>
									{(["titular", "suplente"] as const).map((role) => (
										<label key={role}>
											<input type="radio" name={`role-${index}`} checked={reviewer.role === role} onChange={() => update(index, { role })} />
											<span>{role === "titular" ? "Titular" : "Suplente"}</span>
										</label>
									))}
								</div>
								<button type="button" className="btn btn--quiet btn--small" disabled={reviewers.length === 1} onClick={() => setReviewers(reviewers.filter((_, item) => item !== index))}>
									{form.remove}<span className="visually-hidden"> {reviewer.name || `avaliador ${index + 1}`}</span>
								</button>
							</div>
							{message(`reviewers.${index}`)}
						</li>
					))}
				</ol>
				{message("reviewers")}
				<p><button type="button" className="btn btn--quiet" disabled={reviewers.length >= 12} onClick={() => setReviewers([...reviewers, emptyReviewer()])}>{form.add}</button></p>
			</fieldset>

			<div className="send">
				<p className="soft" aria-live="polite">{academic ? form.kindAcademic : form.kindSelection}</p>
				{failure ? <p className="error" role="alert">{failure}</p> : null}
				<button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>{pending ? form.submitting : form.submit}</button>
			</div>
		</form>
	);
}
