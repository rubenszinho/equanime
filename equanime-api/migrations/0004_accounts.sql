-- Accounts: an email confirmed by a code, a password, sessions held by the web app's cookie.
-- Analyses keep their `actor` (the email), so analyses made before accounts belong to whoever
-- registers that email.
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	pass TEXT NOT NULL,
	email_ok TEXT,
	created TEXT NOT NULL,
	last_seen TEXT
);

-- One pending code per account and kind (email confirmation, password reset); only its HMAC.
CREATE TABLE IF NOT EXISTS codes (
	user_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	hash TEXT NOT NULL,
	expires INTEGER NOT NULL,
	tries INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, kind)
);

-- The SHA-256 of the session token; the token lives only in the visitor's cookie.
CREATE TABLE IF NOT EXISTS sessions (
	hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- Per-day counters for limits (sign-in failures, codes sent, sign-up bursts).
CREATE TABLE IF NOT EXISTS usage (
	day TEXT NOT NULL,
	who TEXT NOT NULL,
	kind TEXT NOT NULL,
	n INTEGER NOT NULL,
	PRIMARY KEY (day, who, kind)
);

-- Credits for accounts outside the free institutions: one credit checks one reviewer.
CREATE TABLE IF NOT EXISTS wallets (
	user_id TEXT PRIMARY KEY,
	n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0)
);

-- Every change to a wallet: grant:<uuid>, charge:<analysis>, refund:<analysis>.
CREATE TABLE IF NOT EXISTS ledger (
	ref TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	n INTEGER NOT NULL,
	analysis_id TEXT,
	note TEXT,
	created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id, created);
