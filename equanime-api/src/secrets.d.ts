interface CloudflareBindings {
	COLLECTOR_TOKEN?: string;
	COLLECTOR_ACCESS_SECRET?: string;
	LLM_API_KEY?: string;
	ACCESS_CLIENT_SECRET?: string;
	OPENWEBUI_KEY?: string;
	AGENT_KEY?: string;
	WEB_KEY?: string;
	// Comma-separated emails that see accounts and grant credits; a secret so the emails stay out of the repo.
	ADMINS?: string;
}

declare module "*.ttf" {
	const value: ArrayBuffer;
	export default value;
}
