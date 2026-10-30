import { AsyncLocalStorage } from "node:async_hooks";

// Who the agent is talking to, for the tools: an email from the web app, "rubry:<id>" from rubry.ai,
// "openwebui:<email>" or "service:openwebui" from OpenWebUI. equanime-api scopes analyses by it.
const store = new AsyncLocalStorage<string>();

export const asPerson = <T>(person: string, run: () => T): T => store.run(person, run);

export function currentPerson(): string {
	const person = store.getStore();
	if (!person) throw new Error("No person for this request");
	return person;
}
