-- Documents a person attaches in the chat (a notice, minutes, a list of the board):
-- the agent reads them to fill in an analysis. Same retention as the analyses.
CREATE TABLE IF NOT EXISTS documents (
	id TEXT PRIMARY KEY,
	actor TEXT NOT NULL,
	name TEXT NOT NULL,
	content_type TEXT NOT NULL,
	size INTEGER NOT NULL,
	object_key TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_actor ON documents(actor, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
