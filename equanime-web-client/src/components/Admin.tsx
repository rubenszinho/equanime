import { useEffect, useState } from "react";
import { admin as copy } from "../data/copy";
import { api } from "../lib/api";
import { toast } from "sonner";

type Row = { email: string; name: string; confirmed: boolean; created: string; last_seen: string | null; credits: number; analyses: number; institution: string | null };

export default function Admin() {
	const [rows, setRows] = useState<Row[]>([]);
	const [email, setEmail] = useState("");
	const [amount, setAmount] = useState("12");
	const [note, setNote] = useState("");
	const [error, setError] = useState("");

	const load = () => api<{ users: Row[] }>("/admin/usuarios").then((reply) => (reply.ok ? setRows(reply.body.users) : setError(reply.message)));
	useEffect(() => void load(), []);

	async function submit(event: { preventDefault(): void }) {
		event.preventDefault();
		setError("");
		const reply = await api<{ email: string; credits: number }>("/admin/creditos", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, credits: Number(amount), note }),
		});
		if (!reply.ok) return setError(reply.message);
		toast.success(copy.done(reply.body.email, reply.body.credits));
		void load();
	}

	return (
		<div className="admin">
			<h1>{copy.title}</h1>
			<form className="sheet box admin__grant" onSubmit={submit}>
				<h2>{copy.grantTitle}</h2>
				<label className="field"><span>{copy.email}</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
				<label className="field"><span>{copy.amount}</span><input type="number" step={1} required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
				<label className="field"><span>{copy.note}</span><input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} /></label>
				{error ? <p className="error" role="alert">{error}</p> : null}
				<button type="submit" className="btn btn--primary btn--small">{copy.submit}</button>
			</form>
			<div className="admin__table">
				<table>
					<thead><tr><th>{copy.email}</th><th>{copy.name}</th><th>{copy.credits}</th><th>{copy.analyses}</th></tr></thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.email}>
								<td><button type="button" className="link" onClick={() => setEmail(row.email)}>{row.email}</button>{row.confirmed ? null : <span className="soft small"> ({copy.unconfirmed})</span>}</td>
								<td>{row.name}</td>
								<td>{row.institution ? copy.free : row.credits}</td>
								<td>{row.analyses}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
