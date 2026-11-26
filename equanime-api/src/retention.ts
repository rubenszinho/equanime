import { deleteAnalysis, deleteDocument, deleteUpload, expiredAnalyses, expiredDocuments, expiredUploads, snapshotKeys, type DocumentRow, type UploadRow } from "./repository";
import { logInfo } from "./log";

const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionDays(env: CloudflareBindings): number {
	return Number(env.RETENTION_DAYS || "90");
}

/** When an analysis made at `createdAt` is deleted. */
export function expiresAt(env: CloudflareBindings, createdAt: string): string {
	return new Date(new Date(createdAt).getTime() + retentionDays(env) * DAY_MS).toISOString();
}

async function purgeAnalysis(env: CloudflareBindings, id: string, reportKey: string | null): Promise<void> {
	const keys = await snapshotKeys(env.DB, id);
	if (reportKey) keys.push(reportKey);
	await Promise.all(keys.map((key) => env.EVIDENCE.delete(key)));
	await deleteAnalysis(env.DB, id);
}

async function purgeFiles(env: CloudflareBindings, uploads: UploadRow[], documents: DocumentRow[]): Promise<void> {
	for (const upload of uploads) {
		await env.EVIDENCE.delete(upload.object_key);
		await deleteUpload(env.DB, upload.id);
	}
	for (const document of documents) {
		await env.EVIDENCE.delete(document.object_key);
		await deleteDocument(env.DB, document.id);
	}
}

export async function purgeExpired(env: CloudflareBindings, now = new Date()): Promise<number> {
	const before = new Date(now.getTime() - retentionDays(env) * DAY_MS).toISOString();
	const rows = await expiredAnalyses(env.DB, before);
	for (const row of rows) {
		await purgeAnalysis(env, row.id, row.report_key);
		logInfo("analysis_purged", { analysis_id: row.id });
	}
	// Uploaded CVs and documents attached in the chat follow the same window as the analyses.
	await purgeFiles(env, await expiredUploads(env.DB, before), await expiredDocuments(env.DB, before));
	return rows.length;
}

/** Everything one person made: their account was deleted. */
export async function purgeActor(env: CloudflareBindings, actor: string): Promise<void> {
	const { results } = await env.DB.prepare("SELECT id, report_key FROM analyses WHERE actor = ?").bind(actor).all<{ id: string; report_key: string | null }>();
	for (const row of results) await purgeAnalysis(env, row.id, row.report_key);
	const uploads = (await env.DB.prepare("SELECT * FROM uploads WHERE actor = ?").bind(actor).all<UploadRow>()).results;
	const documents = (await env.DB.prepare("SELECT * FROM documents WHERE actor = ?").bind(actor).all<DocumentRow>()).results;
	await purgeFiles(env, uploads, documents);
}
