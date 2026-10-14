export type LogFields = Record<string, unknown>;

export function logInfo(event: string, fields: LogFields = {}): void {
	console.log(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, fields: LogFields = {}): void {
	console.error(JSON.stringify({ level: "error", event, ...fields }));
}
