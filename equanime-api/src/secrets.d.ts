interface CloudflareBindings {
	COLLECTOR_TOKEN?: string;
	COLLECTOR_ACCESS_SECRET?: string;
	LLM_API_KEY?: string;
	ACCESS_CLIENT_SECRET?: string;
	OPENWEBUI_KEY?: string;
}

declare module "*.ttf" {
	const value: ArrayBuffer;
	export default value;
}
