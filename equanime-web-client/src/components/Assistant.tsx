import { AgentProvider, AssistantScreen, ChatBox, ptBR } from "@rubrion/beholder-react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { assistant } from "../data/copy";
import { api } from "../lib/api";
import Seal from "./Seal";
import "../styles/agent.css";

type Me = { email: string; name: string };
type Upload = { curriculum_ref: string; lattes_id: string; name: string | null; publications: number };

type Document = { document_ref: string; name: string };

const CV = /\.(xml|zip)$/i;
const DOCUMENTS = ".pdf,.docx,.odt,.xlsx,.ods,.csv,.txt,.md,.html";

// A Lattes XML or ZIP attached in the chat is stored like one sent on the analysis page; the agent
// gets the line below and passes curriculum_ref to its tools. Anything else is a document about the
// board (an edital, minutes): stored for the agent to read with ler_documento.
async function upload(file: File) {
	const body = new FormData();
	body.set("file", file);
	if (!CV.test(file.name)) {
		const sent = await api<Document>("/documentos", { method: "POST", body });
		return sent.ok ? { note: assistant.document(sent.body.name, sent.body.document_ref) } : { error: sent.message };
	}
	const reply = await api<Upload>("/curriculos", { method: "POST", body });
	if (!reply.ok) return { error: reply.message };
	const { curriculum_ref, lattes_id, name, publications } = reply.body;
	return { note: assistant.attached(name ?? file.name, lattes_id, publications, curriculum_ref) };
}

const HASH = "#assistente";

// The floating chat and its expanded view, in one island: they share the provider, so expanding
// mid-answer keeps the answer arriving.
export default function Assistant({ analysisId }: { analysisId?: string }) {
	const [me, setMe] = useState<Me | null>(null);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		fetch("/api/me").then((reply) => (reply.ok ? (reply.json() as Promise<Me>) : null)).then(setMe).catch(() => setMe(null));
		const sync = () => setExpanded(location.hash === HASH);
		sync();
		addEventListener("hashchange", sync);
		return () => removeEventListener("hashchange", sync);
	}, []);

	// Closing drops the hash without a new history entry; replaceState fires no hashchange.
	const close = () => {
		history.replaceState(null, "", location.pathname + location.search);
		setExpanded(false);
	};

	useEffect(() => {
		if (!expanded) return;
		const esc = (event: KeyboardEvent) => event.key === "Escape" && !document.querySelector("[role=dialog][data-state=open]") && close();
		document.addEventListener("keydown", esc);
		document.documentElement.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", esc);
			document.documentElement.style.overflow = "";
		};
	}, [expanded]);

	if (!me) return null;
	return (
		<AgentProvider
			person={me.email}
			personName={me.name || undefined}
			storageKey="equanime"
			defaultAgent="banca"
			strings={ptBR}
			toolLabels={assistant.tools}
			renderMascot={({ phase, size }) => <Seal phase={phase} size={size} />}
			attach={{ accept: `.xml,.zip,text/xml,application/zip,${DOCUMENTS}`, upload }}
			suggestions={analysisId ? [`${assistant.explain} (${analysisId})`, ...assistant.suggestions.slice(0, 2)] : assistant.suggestions}
		>
			{expanded ? (
				<div className="eq-assistant" role="dialog" aria-modal="true" aria-label={assistant.expanded}>
					<header className="eq-assistant__bar">
						<strong>{assistant.expanded}</strong>
						<button type="button" className="theme" onClick={close} aria-label={assistant.close} title={assistant.close}><X aria-hidden="true" /></button>
					</header>
					<AssistantScreen className="eq-assistant__screen" greeting={assistant.greeting(me.name.split(" ")[0])} hint={assistant.hint} />
				</div>
			) : null}
			<ChatBox hidden={expanded} subtitle={assistant.subtitle} onExpand={() => { location.hash = HASH; }} />
		</AgentProvider>
	);
}
