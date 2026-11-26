import { useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, Coins, FileText, LogOut, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { account as copy } from "../data/copy";
import type { Account as AccountData } from "../lib/session";
import { api } from "../lib/api";
import { day, untilDeletion } from "../lib/expiry";
import { initials } from "./AccountMenu";

type Item = { expires_at: string };

export default function Account({ data }: { data: AccountData }) {
	const [analyses, setAnalyses] = useState<Item[] | null>(null);
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const typed = data.has_password === false;

	useEffect(() => {
		api<{ analyses: Item[] }>("/analises").then((reply) => setAnalyses(reply.ok ? reply.body.analyses : []));
	}, []);

	// The analysis deleted soonest: the one to save first.
	const next = analyses?.length ? analyses.map((item) => item.expires_at).sort()[0] : null;

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
		setError(body?.message ?? copy.deleteFailed);
	}

	return (
		<div className="account">
			<header className="account__head">
				<Avatar className="size-16">
					<AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold tracking-wide">{initials(data.name, data.email)}</AvatarFallback>
				</Avatar>
				<div className="account__who">
					<h1>{data.name}</h1>
					<p className="soft">{data.email}</p>
					<p className="account__tags">
						{data.unlimited && data.institution ? <span className="tag tag--ok"><BadgeCheck aria-hidden="true" />{copy.unlimitedTag(data.institution)}</span> : null}
						<span className="soft small">{copy.since(day(data.created))}</span>
					</p>
				</div>
			</header>

			<div className="account__grid">
				<section className="sheet box">
					<h2><Coins aria-hidden="true" />{copy.planTitle}</h2>
					{data.unlimited && data.institution ? (
						<p>{copy.unlimited(data.institution)}</p>
					) : (
						<>
							<p className="credits">{copy.credits(data.credits ?? 0)}</p>
							<p className="soft">{copy.creditsLead}</p>
							<p className="soft">{copy.ask} <a href={`mailto:${copy.contact}`}>{copy.contact}</a>.</p>
						</>
					)}
				</section>

				<section className="sheet box">
					<h2><FileText aria-hidden="true" />{copy.analysesTitle}</h2>
					{analyses === null ? <p className="soft">{copy.loading}</p> : (
						<>
							<p className="credits">{copy.count(analyses.length)}</p>
							{next ? (
								<p className={untilDeletion(next).soon ? "account__next account__next--soon" : "account__next soft"}>
									<CalendarClock aria-hidden="true" />{copy.nextDeletion(day(next), untilDeletion(next).days)}
								</p>
							) : null}
							<p className="soft small">{copy.retention(data.retention_days)}</p>
						</>
					)}
					<p><a className="btn btn--quiet btn--small" href="/analises">{copy.mine}</a></p>
				</section>
			</div>

			{!data.unlimited ? (
				<section className="sheet box">
					<h2>{copy.historyTitle}</h2>
					{data.history.length === 0 ? <p className="soft">{copy.historyEmpty}</p> : (
						<ul className="ledger">
							{data.history.map((item, index) => (
								<li key={index}>
									<span>
										{copy.kinds[item.kind] ?? item.kind}
										<span className="soft"> {item.analysis_id && item.kind === "charge" ? <a href={`/analises/${item.analysis_id}`}>{day(item.created)}</a> : day(item.created)}</span>
										{item.note ? <span className="soft">, {item.note}</span> : null}
									</span>
									<span className={item.n < 0 ? "ledger__n ledger__n--out" : "ledger__n"}>{item.n > 0 ? `+${item.n}` : item.n}</span>
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}

			<section className="account__end">
				<button type="button" className="btn btn--quiet btn--small" onClick={signOut}><LogOut aria-hidden="true" width={16} height={16} />{copy.signOut}</button>
				{data.admin ? <a className="btn btn--quiet btn--small" href="/admin">{copy.admin}</a> : null}
				<AlertDialog onOpenChange={(open) => { if (!open) { setPassword(""); setError(""); } }}>
					<AlertDialogTrigger asChild>
						<button type="button" className="btn btn--danger btn--small"><Trash2 aria-hidden="true" width={16} height={16} />{copy.deleteTitle}</button>
					</AlertDialogTrigger>
					<AlertDialogContent className="account__dialog">
						<form onSubmit={remove} className="grid gap-4">
							<AlertDialogHeader>
								<AlertDialogTitle className="font-display text-2xl font-semibold">{copy.deleteTitle}</AlertDialogTitle>
								<AlertDialogDescription>{copy.deleteLead}</AlertDialogDescription>
							</AlertDialogHeader>
							<label className="field">
								<span>{typed ? copy.deleteType : copy.deletePassword}</span>
								<input type={typed ? "text" : "password"} autoComplete={typed ? "off" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
							</label>
							{error ? <p className="error" role="alert">{error}</p> : null}
							<AlertDialogFooter>
								<AlertDialogCancel className="btn btn--quiet btn--small">{copy.cancel}</AlertDialogCancel>
								<button type="submit" className="btn btn--danger btn--small" disabled={busy || !password} aria-busy={busy}>{copy.deleteSubmit}</button>
							</AlertDialogFooter>
						</form>
					</AlertDialogContent>
				</AlertDialog>
			</section>
		</div>
	);
}
