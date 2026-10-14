import { deleteAnalysis, expiredAnalyses, snapshotKeys } from "./repository";
import { logInfo } from "./log";

export async function purgeExpired(env: CloudflareBindings, now = new Date()): Promise<number> {
	const days = Number(env.RETENTION_DAYS || "90");
	const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
	const rows = await expiredAnalyses(env.DB, before);
	for (const row of rows) {
		const keys = await snapshotKeys(env.DB, row.id);
		if (row.report_key) keys.push(row.report_key);
		await Promise.all(keys.map((key) => env.EVIDENCE.delete(key)));
		await deleteAnalysis(env.DB, row.id);
		logInfo("analysis_purged", { analysis_id: row.id });
	}
	return rows.length;
}
