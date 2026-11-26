import { useState } from "react";
import { account as copy } from "../data/copy";
import type { Account as AccountData } from "../lib/session";
import { day } from "../lib/expiry";

export default function Account({ data }: { data: AccountData }) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function signOut() {
		await fetch("/api/conta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).catch(() => null);
		window.location.assign("/");
	}

	async function remove(event: { preventDefault(): void }) {
		event.preventDefault();
		setBusy(true);
		setError("");
		const reply = await fetch("/api/conta", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }).catch(() => null);
		setBusy(false);
		if (reply?.ok) {
			window.location.assign("/");
			return;
		}
		const body = (await reply?.json().catch(() => null)) as { message?: string } | null;
		setError(body?.message ?? copy.deleteTitle);
	}

	return (
		<div className="account">
			<header className="intro">
				<h1>{copy.title}</h1>
				<p className="soft">{data.name} · {data.email}</p>
				<p className="soft small">{copy.since(day(data.created))}</p>
			</header>

			<section className="sheet box">
				<h2>{copy.planTitle}</h2>
				{data.unlimited && data.institution ? (
					<p>{copy.unlimited(data.institution)}</p>
				) : (
					<>
						<p className="credits">{copy.credits(data.credits ?? 0)}</p>
						<p className="soft">{copy.creditsLead}</p>
						<p className="soft">{copy.ask} <a href={`mailto:${copy.contact}`}>{copy.contact}</a>.</p>
					</>
				)}
				<p className="soft small">{copy.retention(data.retention_days)}</p>
				<p className="account__actions">
					<a className="btn btn--quiet btn--small" href="/analises">{copy.mine}</a>
					{data.admin ? <a className="btn btn--quiet btn--small" href="/admin">{copy.admin}</a> : null}
					<button type="button" className="btn btn--quiet btn--small" onClick={signOut}>{copy.signOut}</button>
				</p>
			</section>

			{!data.unlimited ? (
				<section className="sheet box">
					<h2>{copy.historyTitle}</h2>
					{data.history.length === 0 ? <p className="soft">{copy.historyEmpty}</p> : (
						<ul className="ledger">
							{data.history.map((item, index) => (
								<li key={index}>
									<span>
										{copy.kinds[item.kind] ?? item.kind}
										{item.analysis_id && item.kind === "charge" ? <> · <a href={`/analises/${item.analysis_id}`}>{day(item.created)}</a></> : <span className="soft"> · {day(item.created)}</span>}
										{item.note ? <span className="soft"> · {item.note}</span> : null}
									</span>
									<span className={item.n < 0 ? "ledger__n ledger__n--out" : "ledger__n"}>{item.n > 0 ? `+${item.n}` : item.n}</span>
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}

			<section className="sheet box">
				<h2>{copy.deleteTitle}</h2>
				<p className="soft">{copy.deleteLead}</p>
				<form onSubmit={remove} className="account__delete">
					<label className="field">
						<span>{data.has_password === false ? copy.deleteType : copy.deletePassword}</span>
						<input type={data.has_password === false ? "text" : "password"} autoComplete={data.has_password === false ? "off" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} />
					</label>
					{error ? <p className="error" role="alert">{error}</p> : null}
					<button type="submit" className="btn btn--danger btn--small" disabled={busy || !password} aria-busy={busy}>{copy.deleteSubmit}</button>
				</form>
			</section>
		</div>
	);
}
