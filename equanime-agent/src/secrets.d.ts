interface Secrets {
	/** Shared with equanime-api: lets this Worker act for the person it talks to. */
	AGENT_KEY: string;
	/** /v1 keys: rubry-agent (sends X-Equanime-Person) and OpenWebUI. */
	V1_KEY_RUBRY?: string;
	V1_KEY_OPENWEBUI?: string;
}

declare namespace Cloudflare {
	interface Env extends Secrets {}
}
interface Env extends Secrets {}
