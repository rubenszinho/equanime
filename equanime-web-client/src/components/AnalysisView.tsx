import { useCallback, useEffect, useRef, useState } from "react";
import { collection, roles, ruleTitles, statusLabels, steps, view } from "../data/copy";
import { api } from "../lib/api";
import type { AnalysisResponse, Evidence, Participant, RuleCheck } from "../lib/board";
import Verdict, { type ResultStatus } from "./Verdict";

const terminal = new Set(["completed", "completed_with_warnings", "failed"]);

const date = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

const lattesId = (url: string) => url.match(/[0-9]{16}/)?.[0] ?? url;

export default function AnalysisView({ analysisId }: { analysisId: string }) {
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
	const [missing, setMissing] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const [run, setRun] = useState(0);
	const timer = useRef(0);

	// Polls until a terminal state; a failed poll waits longer instead of giving up.
	useEffect(() => {
		let delay = 2500;
		let alive = true;
		async function load() {
			const reply = await api<AnalysisResponse>(`/analises/${analysisId}`);
			if (!alive) return;
			if (reply.ok) {
				setAnalysis(reply.body);
				setRetrying(false);
				delay = 2500;
				if (!terminal.has(reply.body.status)) timer.current = window.setTimeout(load, delay);
				return;
			}
			if (reply.status === 404) {
				setMissing(true);
				return;
			}
			setRetrying(true);
			delay = Math.min(delay * 2, 20_000);
			timer.current = window.setTimeout(load, delay);
		}
		void load();
		return () => {
			alive = false;
			window.clearTimeout(timer.current);
		};
	}, [analysisId, run]);

	const restart = useCallback(() => setRun((value) => value + 1), []);

	if (missing) return <p className="notice">{view.notFound} <a href="/analises/nova">{view.newAnalysis}</a></p>;
	if (!analysis) return <p className="notice" aria-busy="true">{view.loading}</p>;

	const done = terminal.has(analysis.status);
	const reviewersByRole = (["titular", "suplente"] as const).map((role) => [role, analysis.reviewers.filter((item) => item.reviewer.role === role)] as const);

	return (
		<div className="analysis">
			<header className="head">
				<p className="kind">{analysis.type === "academic" ? view.academic : view.selection}</p>
				<h1>{analysis.candidate.name}</h1>
				{analysis.work_title ? <p className="soft">{analysis.work_title}</p> : null}
				<p className="soft small">
					{analysis.advisor ? <>{view.advisor}: {analysis.advisor.name}. </> : null}
					{date(analysis.created_at)}
				</p>
			</header>

			<Progress status={analysis.status} message={analysis.message} />
			{retrying ? <p className="notice" role="status">{view.retrying}</p> : null}

			{analysis.status === "failed" ? (
				<section className="sheet panel">
					<p>{view.failed}</p>
					<Reprocess analysisId={analysisId} refs={[]} label={view.retry} onDone={restart} />
				</section>
			) : null}

			{done && analysis.summary && analysis.status !== "failed" ? (
				<section className="tally" aria-label="Resumo">
					<p><strong>{analysis.summary.reviewers_analyzed}</strong> {view.summary.analyzed}</p>
					<p className="t-ok"><strong>{analysis.summary.without_identified_conflict}</strong> {view.summary.none}</p>
					<p className="t-flag"><strong>{analysis.summary.potential_conflict}</strong> {view.summary.potential}</p>
					<p className="t-maybe"><strong>{analysis.summary.inconclusive}</strong> {view.summary.inconclusive}</p>
					{analysis.report_url ? <a className="btn btn--primary" href={`/api${analysis.report_url}`} target="_blank" rel="noopener">{view.pdf}</a> : null}
				</section>
			) : null}

			{done && analysis.needs_upload ? <Uploads analysis={analysis} onDone={restart} /> : null}

			{done && analysis.reviewers.length > 0 ? reviewersByRole.map(([role, group]) => group.length === 0 ? null : (
				<section key={role} className="group">
					<h2>{analysis.type === "academic" ? (role === "titular" ? "Titulares" : "Suplentes") : view.reviewers}</h2>
					{group.map((item, index) => (
						<article key={`${role}-${index}`} className="sheet reviewer">
							<header>
								<div>
									<h3>{item.reviewer.name}</h3>
									<p className="soft small">
										{roles[item.reviewer.role]}. {collection[item.reviewer.collection_status]}
										{item.reviewer.detected_name && item.reviewer.detected_name !== item.reviewer.name ? `: ${item.reviewer.detected_name}` : ""}.{" "}
										<a href={item.reviewer.lattes_url} target="_blank" rel="noopener">Lattes {lattesId(item.reviewer.lattes_url)}</a>
									</p>
								</div>
								<Verdict status={item.status} />
							</header>
							<Rule title={ruleTitles.coauthorship} check={item.checks.coauthorship} />
							{analysis.type === "academic" ? <Rule title={ruleTitles.recent_advisor_relationship} check={item.checks.recent_advisor_relationship} /> : null}
							<Rule title={ruleTitles.joint_research_projects} check={item.checks.joint_research_projects} />
						</article>
					))}
				</section>
			)) : null}

			{done && analysis.limitations.length > 0 ? (
				<section className="group">
					<h2>{view.limitations}</h2>
					<ul className="limits">{analysis.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
				</section>
			) : null}

			{done ? <p><a className="btn btn--quiet" href="/analises/nova">{view.newAnalysis}</a></p> : null}
		</div>
	);
}

function Progress({ status, message }: { status: string; message: string }) {
	const current = steps.indexOf(status === "completed_with_warnings" ? "completed" : (status as (typeof steps)[number]));
	return (
		<section className="progress" aria-live="polite">
			<ol>
				{steps.map((step, index) => (
					<li key={step} className={status === "failed" ? "" : index < current || status.startsWith("completed") ? "past" : index === current ? "now" : ""} aria-current={index === current ? "step" : undefined}>
						{statusLabels[step]}
					</li>
				))}
			</ol>
			<p className="soft"><strong>{statusLabels[status] ?? status}.</strong> {terminal.has(status) ? null : message}</p>
		</section>
	);
}

function Rule({ title, check }: { title: string; check: RuleCheck }) {
	if (check.applicable === false) {
		return <div className="rule"><h4>{title}</h4><p className="soft small">{view.notApplicable}</p></div>;
	}
	const status: ResultStatus = check.detected ? "potential_conflict" : check.inconclusive ? "inconclusive" : "no_conflict_identified";
	return (
		<div className={`rule rule--${status}`}>
			<h4>{title}</h4>
			<p className="small">{check.result}</p>
			{check.evidence.length > 0 ? (
				<details open={check.detected}>
					<summary>{view.evidence} ({check.evidence.length})</summary>
					<ul className="evidence">{check.evidence.map((item, index) => <EvidenceItem key={index} item={item} />)}</ul>
				</details>
			) : null}
		</div>
	);
}

function EvidenceItem({ item }: { item: Evidence }) {
	const source = item.source_curriculum.match(/\((https?:\/\/[^)]+)\)$/)?.[1];
	const what = item.publication ?? item.project ?? item.record;
	return (
		<li>
			<p className="what">{what}{item.year_or_period && !what.includes(item.year_or_period) ? ` (${item.year_or_period})` : ""}</p>
			<dl>
				{item.orientation_type ? <><dt>Tipo</dt><dd>{item.orientation_type}</dd></> : null}
				{item.authors?.length ? <><dt>{view.authors}</dt><dd>{item.authors.join("; ")}</dd></> : null}
				{item.institution ? <><dt>{view.institution}</dt><dd>{item.institution}</dd></> : null}
				<dt>{view.people}</dt><dd>{item.people.join(" e ")}</dd>
				<dt>{view.source}</dt>
				<dd>{source ? <a href={source} target="_blank" rel="noopener">{item.source_curriculum.replace(` (${source})`, "")}</a> : item.source_curriculum}{item.consulted_at ? `, ${view.consulted} ${date(item.consulted_at)}` : ""}</dd>
			</dl>
			{item.confidence === "medium" ? <p className="small t-maybe">{view.check}</p> : null}
		</li>
	);
}

type Sent = { ref: string; name: string | null; publications: number };

function Uploads({ analysis, onDone }: { analysis: AnalysisResponse; onDone(): void }) {
	const people: Participant[] = [analysis.candidate, ...(analysis.advisor ? [analysis.advisor] : []), ...analysis.reviewers.map((item) => item.reviewer)]
		.filter((person) => person.collection_status === "needs_upload");
	const [sent, setSent] = useState<Record<string, Sent>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [busy, setBusy] = useState("");

	async function send(person: Participant, file: File | undefined) {
		if (!file) return;
		const key = person.lattes_url;
		setBusy(key);
		const body = new FormData();
		body.set("file", file);
		const reply = await api<{ curriculum_ref: string; lattes_id: string; name: string | null; publications: number }>("/curriculos", { method: "POST", body });
		setBusy("");
		if (!reply.ok) {
			setErrors({ ...errors, [key]: reply.message || view.upload.error });
			return;
		}
		if (reply.body.lattes_id !== lattesId(person.lattes_url)) {
			setErrors({ ...errors, [key]: `Este XML é do currículo ${reply.body.lattes_id}, não de ${person.name}.` });
			return;
		}
		setErrors({ ...errors, [key]: "" });
		setSent({ ...sent, [key]: { ref: reply.body.curriculum_ref, name: reply.body.name, publications: reply.body.publications } });
	}

	const refs = Object.values(sent).map((item) => item.ref);
	return (
		<section className="sheet panel uploads">
			<h2>{view.upload.title}</h2>
			<p className="soft">{view.upload.lead}</p>
			<ul>
				{people.map((person) => {
					const key = person.lattes_url;
					const done = sent[key];
					return (
						<li key={key}>
							<div>
								<strong>{person.name}</strong>
								<p className="soft small">{person.collection_message}</p>
								{done ? <p className="small t-ok" role="status">{view.upload.sent(done.name, done.publications)}</p> : null}
								{errors[key] ? <p className="small error" role="alert">{errors[key]}</p> : null}
							</div>
							<div className="upload-actions">
								<a className="btn btn--quiet btn--small" href={person.lattes_url} target="_blank" rel="noopener">{view.upload.open}</a>
								<label className="btn btn--quiet btn--small file" aria-busy={busy === key}>
									{view.upload.choose}
									<input type="file" accept=".xml,.zip,text/xml,application/zip" aria-label={`XML do currículo de ${person.name}`} onChange={(event) => void send(person, event.target.files?.[0])} />
								</label>
							</div>
						</li>
					);
				})}
			</ul>
			<Reprocess analysisId={analysis.analysis_id} refs={refs} label={view.upload.reprocess} disabled={refs.length === 0} onDone={onDone} />
		</section>
	);
}

function Reprocess({ analysisId, refs, label, disabled = false, onDone }: { analysisId: string; refs: string[]; label: string; disabled?: boolean; onDone(): void }) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function go() {
		setBusy(true);
		const reply = await api(`/analises/${analysisId}/reprocessar`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ curriculum_refs: refs }),
		});
		setBusy(false);
		if (!reply.ok) {
			setError(reply.message);
			return;
		}
		onDone();
	}
	return (
		<p className="reprocess">
			<button type="button" className="btn btn--primary" disabled={disabled || busy} aria-busy={busy} onClick={() => void go()}>{busy ? view.upload.reprocessing : label}</button>
			{error ? <span className="error" role="alert">{error}</span> : null}
		</p>
	);
}
