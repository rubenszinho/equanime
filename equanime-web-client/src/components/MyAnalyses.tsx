import { useEffect, useState } from "react";
import { mine as copy, statusLabels } from "../data/copy";
import { api } from "../lib/api";
import { day, untilDeletion } from "../lib/expiry";

type Item = {
	analysis_id: string;
	type: "academic" | "selection";
	status: string;
	candidate_name: string | null;
	work_title: string | null;
	created_at: string;
	expires_at: string;
};

export default function MyAnalyses() {
	const [items, setItems] = useState<Item[] | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		api<{ analyses: Item[] }>("/analises").then((reply) => (reply.ok ? setItems(reply.body.analyses) : setError(reply.message || copy.error)));
	}, []);

	if (error) return <p className="notice" role="alert">{error}</p>;
	if (!items) return <p className="notice" aria-busy="true">{copy.loading}</p>;
	if (items.length === 0) return <p className="notice">{copy.empty} <a href="/analises/nova">{copy.start}</a></p>;

	return (
		<ul className="mine" data-count={items.length}>
			{items.map((item) => {
				const { days, soon } = untilDeletion(item.expires_at);
				return (
					<li key={item.analysis_id} className="sheet mine__item">
						<a href={`/analises/${item.analysis_id}`} className="mine__link">
							<span className="mine__who">{item.candidate_name ?? copy.candidate}</span>
							<span className="soft small">{item.work_title ?? copy.untitled}</span>
						</a>
						<span className="mine__meta small">
							<span className="mine__status">{statusLabels[item.status] ?? item.status}</span>
							<span className="soft">{copy.created} {day(item.created_at)}</span>
							{soon ? <span className="badge badge--soon">{copy.soon(days)}</span> : <span className="soft">{copy.expires} {day(item.expires_at)}</span>}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
