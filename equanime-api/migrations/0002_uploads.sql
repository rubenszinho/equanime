-- Lattes XML files sent by users when no automatic source could read a CV.
CREATE TABLE IF NOT EXISTS uploads (
	id TEXT PRIMARY KEY,
	actor TEXT NOT NULL,
	lattes_id TEXT NOT NULL,
	detected_name TEXT,
	object_key TEXT NOT NULL,
	created_at TEXT NOT NULL
);

ALTER TABLE participants ADD COLUMN upload_id TEXT;

CREATE INDEX IF NOT EXISTS idx_uploads_actor ON uploads(actor, created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_idempotency ON analyses(actor, idempotency_key);
