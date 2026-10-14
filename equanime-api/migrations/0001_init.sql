CREATE TABLE IF NOT EXISTS analyses (
	id TEXT PRIMARY KEY,
	idempotency_key TEXT UNIQUE,
	payload_hash TEXT NOT NULL,
	type TEXT NOT NULL,
	status TEXT NOT NULL,
	message TEXT NOT NULL,
	work_title TEXT,
	actor TEXT NOT NULL,
	assistant_summary TEXT,
	summary_json TEXT,
	limitations_json TEXT NOT NULL DEFAULT '[]',
	report_key TEXT,
	workflow_instance_id TEXT,
	error_message TEXT,
	timings_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	completed_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
	id TEXT PRIMARY KEY,
	analysis_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	reviewer_role TEXT,
	requested_name TEXT NOT NULL,
	detected_name TEXT,
	lattes_url TEXT NOT NULL,
	lattes_id TEXT NOT NULL,
	collection_status TEXT NOT NULL DEFAULT 'pending',
	collection_error TEXT,
	consulted_at TEXT,
	snapshot_key TEXT,
	warnings_json TEXT NOT NULL DEFAULT '[]',
	FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);

CREATE TABLE IF NOT EXISTS reviewer_results (
	id TEXT PRIMARY KEY,
	analysis_id TEXT NOT NULL,
	participant_id TEXT NOT NULL,
	status TEXT NOT NULL,
	status_label TEXT NOT NULL,
	checks_json TEXT NOT NULL,
	FOREIGN KEY (analysis_id) REFERENCES analyses(id),
	FOREIGN KEY (participant_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS evidence (
	id TEXT PRIMARY KEY,
	analysis_id TEXT NOT NULL,
	reviewer_result_id TEXT NOT NULL,
	rule TEXT NOT NULL,
	payload_json TEXT NOT NULL,
	FOREIGN KEY (analysis_id) REFERENCES analyses(id),
	FOREIGN KEY (reviewer_result_id) REFERENCES reviewer_results(id)
);

CREATE TABLE IF NOT EXISTS analysis_events (
	id TEXT PRIMARY KEY,
	analysis_id TEXT NOT NULL,
	status TEXT NOT NULL,
	message TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);

CREATE TABLE IF NOT EXISTS model_calls (
	id TEXT PRIMARY KEY,
	analysis_id TEXT NOT NULL,
	model TEXT NOT NULL,
	purpose TEXT NOT NULL,
	status TEXT NOT NULL,
	duration_ms INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (analysis_id) REFERENCES analyses(id)
);

CREATE INDEX IF NOT EXISTS idx_analyses_actor_created ON analyses(actor, created_at);
CREATE INDEX IF NOT EXISTS idx_participants_analysis ON participants(analysis_id);
CREATE INDEX IF NOT EXISTS idx_results_analysis ON reviewer_results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_events_analysis ON analysis_events(analysis_id);
