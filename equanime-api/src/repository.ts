import type { AnalysisRow, AnalysisStatus, CollectionStatus, CurriculumWarning, ParticipantKind, ParticipantRow, ReviewerRole } from "./domain";

type AnalysisRecord = {
	id: string;
	idempotency_key: string | null;
	payload_hash: string;
	type: "academic" | "selection";
	status: AnalysisStatus;
	message: string;
	work_title: string | null;
	actor: string;
	assistant_summary: string | null;
	summary_json: string | null;
	limitations_json: string;
	report_key: string | null;
	workflow_instance_id: string | null;
	error_message: string | null;
	timings_json: string;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
};

function mapAnalysis(row: AnalysisRecord): AnalysisRow {
	return {
		...row,
		limitations: JSON.parse(row.limitations_json) as string[],
		timings: JSON.parse(row.timings_json) as Record<string, number>,
	};
}

type ParticipantRecord = {
	id: string;
	analysis_id: string;
	kind: ParticipantKind;
	reviewer_role: ReviewerRole | null;
	requested_name: string;
	detected_name: string | null;
	lattes_url: string;
	lattes_id: string;
	collection_status: CollectionStatus;
	collection_error: string | null;
	consulted_at: string | null;
	snapshot_key: string | null;
	upload_id: string | null;
	warnings_json: string;
};

function mapParticipant(row: ParticipantRecord): ParticipantRow {
	return { ...row, warnings: JSON.parse(row.warnings_json) as CurriculumWarning[] };
}

export async function findByIdempotency(db: D1Database, actor: string, key: string): Promise<AnalysisRow | null> {
	const row = await db.prepare("SELECT * FROM analyses WHERE actor = ? AND idempotency_key = ?").bind(actor, key).first<AnalysisRecord>();
	return row ? mapAnalysis(row) : null;
}

export async function getAnalysis(db: D1Database, id: string): Promise<AnalysisRow | null> {
	const row = await db.prepare("SELECT * FROM analyses WHERE id = ?").bind(id).first<AnalysisRecord>();
	return row ? mapAnalysis(row) : null;
}

export async function listByActor(db: D1Database, actor: string, limit: number): Promise<Array<AnalysisRecord & { candidate_name: string | null }>> {
	const { results } = await db
		.prepare("SELECT a.*, (SELECT requested_name FROM participants p WHERE p.analysis_id = a.id AND p.kind = 'candidate') AS candidate_name FROM analyses a WHERE a.actor = ? ORDER BY a.created_at DESC LIMIT ?")
		.bind(actor, limit)
		.all<AnalysisRecord & { candidate_name: string | null }>();
	return results;
}

export async function countRecent(db: D1Database, actor: string, since: string): Promise<number> {
	const row = await db.prepare("SELECT COUNT(*) AS n FROM analyses WHERE actor = ? AND created_at >= ?").bind(actor, since).first<{ n: number }>();
	return row?.n ?? 0;
}

export async function insertAnalysis(db: D1Database, row: AnalysisRow): Promise<void> {
	await db.prepare(`INSERT INTO analyses (
		id, idempotency_key, payload_hash, type, status, message, work_title, actor, assistant_summary,
		summary_json, limitations_json, report_key, workflow_instance_id, error_message, timings_json,
		created_at, updated_at, completed_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
		row.id, row.idempotency_key, row.payload_hash, row.type, row.status, row.message, row.work_title, row.actor,
		row.assistant_summary, row.summary_json, JSON.stringify(row.limitations), row.report_key, row.workflow_instance_id,
		row.error_message, JSON.stringify(row.timings), row.created_at, row.updated_at, row.completed_at,
	).run();
	await addEvent(db, row.id, row.status, row.message, row.created_at);
}

export async function insertParticipant(db: D1Database, row: ParticipantRow): Promise<void> {
	await db.prepare(`INSERT INTO participants (
		id, analysis_id, kind, reviewer_role, requested_name, detected_name, lattes_url, lattes_id,
		collection_status, collection_error, consulted_at, snapshot_key, upload_id, warnings_json
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
		row.id, row.analysis_id, row.kind, row.reviewer_role, row.requested_name, row.detected_name, row.lattes_url,
		row.lattes_id, row.collection_status, row.collection_error, row.consulted_at, row.snapshot_key, row.upload_id, JSON.stringify(row.warnings),
	).run();
}

export async function listParticipants(db: D1Database, analysisId: string): Promise<ParticipantRow[]> {
	const result = await db.prepare("SELECT * FROM participants WHERE analysis_id = ? ORDER BY rowid").bind(analysisId).all<ParticipantRecord>();
	return result.results.map(mapParticipant);
}

export async function updateStatus(db: D1Database, id: string, status: AnalysisStatus, message: string, at: string): Promise<void> {
	await db.prepare("UPDATE analyses SET status = ?, message = ?, updated_at = ? WHERE id = ?").bind(status, message, at, id).run();
	await addEvent(db, id, status, message, at);
}

export async function addEvent(db: D1Database, analysisId: string, status: string, message: string, at: string): Promise<void> {
	await db.prepare("INSERT INTO analysis_events (id, analysis_id, status, message, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), analysisId, status, message, at).run();
}

export async function saveCollection(db: D1Database, participantId: string, status: CollectionStatus, detectedName: string | null, consultedAt: string | null, snapshotKey: string | null, warnings: CurriculumWarning[], error: string | null): Promise<void> {
	await db.prepare(`UPDATE participants SET collection_status = ?, detected_name = ?, consulted_at = ?, snapshot_key = ?, warnings_json = ?, collection_error = ? WHERE id = ?`).bind(
		status, detectedName, consultedAt, snapshotKey, JSON.stringify(warnings), error, participantId,
	).run();
}

export async function replaceResults(db: D1Database, analysisId: string, results: Array<{ id: string; participantId: string; status: string; statusLabel: string; checksJson: string; evidence: Array<{ rule: string; payload: unknown }> }>): Promise<void> {
	await db.prepare("DELETE FROM evidence WHERE analysis_id = ?").bind(analysisId).run();
	await db.prepare("DELETE FROM reviewer_results WHERE analysis_id = ?").bind(analysisId).run();
	for (const result of results) {
		await db.prepare("INSERT INTO reviewer_results (id, analysis_id, participant_id, status, status_label, checks_json) VALUES (?, ?, ?, ?, ?, ?)").bind(
			result.id, analysisId, result.participantId, result.status, result.statusLabel, result.checksJson,
		).run();
		for (const item of result.evidence) {
			await db.prepare("INSERT INTO evidence (id, analysis_id, reviewer_result_id, rule, payload_json) VALUES (?, ?, ?, ?, ?)").bind(
				crypto.randomUUID(), analysisId, result.id, item.rule, JSON.stringify(item.payload),
			).run();
		}
	}
}

export async function completeAnalysis(db: D1Database, input: {
	id: string;
	status: AnalysisStatus;
	message: string;
	summaryJson: string;
	assistantSummary: string;
	limitations: string[];
	reportKey: string | null;
	timings: Record<string, number>;
	at: string;
	error?: string | null;
}): Promise<void> {
	await db.prepare(`UPDATE analyses SET status = ?, message = ?, summary_json = ?, assistant_summary = ?, limitations_json = ?, report_key = ?, timings_json = ?, updated_at = ?, completed_at = ?, error_message = ? WHERE id = ?`).bind(
		input.status, input.message, input.summaryJson, input.assistantSummary, JSON.stringify(input.limitations), input.reportKey, JSON.stringify(input.timings), input.at, input.at, input.error ?? null, input.id,
	).run();
	await addEvent(db, input.id, input.status, input.message, input.at);
}

export async function listResults(db: D1Database, analysisId: string): Promise<Array<{ participant_id: string; status: string; status_label: string; checks_json: string }>> {
	const rows = await db.prepare("SELECT participant_id, status, status_label, checks_json FROM reviewer_results WHERE analysis_id = ?").bind(analysisId).all<{ participant_id: string; status: string; status_label: string; checks_json: string }>();
	return rows.results;
}

export async function recordModelCall(db: D1Database, analysisId: string, model: string, purpose: string, status: string, durationMs: number, at: string): Promise<void> {
	await db.prepare("INSERT INTO model_calls (id, analysis_id, model, purpose, status, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
		crypto.randomUUID(), analysisId, model, purpose, status, durationMs, at,
	).run();
}

export async function expiredAnalyses(db: D1Database, before: string): Promise<Array<{ id: string; report_key: string | null }>> {
	const rows = await db.prepare("SELECT id, report_key FROM analyses WHERE created_at < ?").bind(before).all<{ id: string; report_key: string | null }>();
	return rows.results;
}

export async function deleteAnalysis(db: D1Database, id: string): Promise<void> {
	await db.batch([
		db.prepare("DELETE FROM model_calls WHERE analysis_id = ?").bind(id),
		db.prepare("DELETE FROM evidence WHERE analysis_id = ?").bind(id),
		db.prepare("DELETE FROM reviewer_results WHERE analysis_id = ?").bind(id),
		db.prepare("DELETE FROM analysis_events WHERE analysis_id = ?").bind(id),
		db.prepare("DELETE FROM participants WHERE analysis_id = ?").bind(id),
		db.prepare("DELETE FROM analyses WHERE id = ?").bind(id),
	]);
}

export async function snapshotKeys(db: D1Database, analysisId: string): Promise<string[]> {
	const rows = await db.prepare("SELECT snapshot_key FROM participants WHERE analysis_id = ? AND snapshot_key IS NOT NULL").bind(analysisId).all<{ snapshot_key: string }>();
	return rows.results.map((row) => row.snapshot_key);
}

export type UploadRow = { id: string; actor: string; lattes_id: string; detected_name: string | null; object_key: string; created_at: string };

export async function insertUpload(db: D1Database, row: UploadRow): Promise<void> {
	await db.prepare("INSERT INTO uploads (id, actor, lattes_id, detected_name, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
		row.id, row.actor, row.lattes_id, row.detected_name, row.object_key, row.created_at,
	).run();
}

export async function getUpload(db: D1Database, id: string): Promise<UploadRow | null> {
	return db.prepare("SELECT * FROM uploads WHERE id = ?").bind(id).first<UploadRow>();
}

export async function attachUpload(db: D1Database, participantId: string, uploadId: string): Promise<void> {
	await db.prepare("UPDATE participants SET upload_id = ? WHERE id = ?").bind(uploadId, participantId).run();
}

// Reprocessing keeps the board and its uploads and starts the run again.
export async function resetAnalysis(db: D1Database, id: string, at: string): Promise<void> {
	await db.batch([
		db.prepare("UPDATE participants SET collection_status = 'pending', collection_error = NULL, consulted_at = NULL, snapshot_key = NULL, detected_name = NULL, warnings_json = '[]' WHERE analysis_id = ?").bind(id),
		db.prepare("UPDATE analyses SET status = 'pending', message = ?, assistant_summary = NULL, summary_json = NULL, limitations_json = '[]', report_key = NULL, error_message = NULL, timings_json = '{}', updated_at = ?, completed_at = NULL WHERE id = ?").bind("A análise foi reenviada e aguarda processamento.", at, id),
	]);
	await addEvent(db, id, "pending", "A análise foi reenviada e aguarda processamento.", at);
}

export async function expiredUploads(db: D1Database, before: string): Promise<UploadRow[]> {
	const rows = await db.prepare("SELECT * FROM uploads WHERE created_at < ?").bind(before).all<UploadRow>();
	return rows.results;
}

export async function deleteUpload(db: D1Database, id: string): Promise<void> {
	await db.prepare("DELETE FROM uploads WHERE id = ?").bind(id).run();
}
