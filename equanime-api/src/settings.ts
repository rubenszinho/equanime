export function envString(env: CloudflareBindings, key: keyof CloudflareBindings): string {
	const value = env[key];
	return typeof value === "string" ? value : "";
}
