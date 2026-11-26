// Accounts, sessions, codes, entitlements and credits (adapted from rubry.ai's).
// Passwords are PBKDF2-SHA256; codes and session tokens are stored only as hashes.
import { envString } from "./settings";

const enc = new TextEncoder();
const ITERATIONS = 100_000; // the most Workers' PBKDF2 allows
export const MIN_PASSWORD = 8;
export const SESSION_TTL = 30 * 24 * 60 * 60;
const CODE_TTL = 10 * 60;
const CODE_TRIES = 5;
const CODE_COOLDOWN = 60;

export type User = { id: string; email: string; name: string; email_ok: string | null; created: string };
export type CodeKind = "email" | "reset";

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const now = () => Math.floor(Date.now() / 1000);
export const today = () => new Date().toISOString().slice(0, 10);

export function same(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
	return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
	const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256));
}

/** `pbkdf2$<iterations>$<salt>$<hash>`, base64. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
	const [, iterations, salt, hash] = stored.split("$");
	if (!iterations || !salt || !hash) return false;
	return same(await pbkdf2(password, unb64(salt), Number(iterations)), unb64(hash));
}

export const normalEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
export const validEmail = (email: string) => email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function tokenHash(token: string): Promise<string> {
	return hex(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}

// Codes are a keyed HMAC, so a leaked table can't be brute-forced offline without the key.
async function sign(env: CloudflareBindings, data: string): Promise<string> {
	const secret = env.WEB_KEY || "development";
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

// ---- users and sessions

const USER_COLUMNS = "u.id, u.email, u.name, u.email_ok, u.created";

export async function userByEmail(db: D1Database, email: string): Promise<(User & { pass: string }) | null> {
	return db.prepare(`SELECT ${USER_COLUMNS}, u.pass FROM users u WHERE u.email = ?`).bind(email).first<User & { pass: string }>();
}

export async function createUser(db: D1Database, input: { email: string; name: string; password: string }): Promise<string | null> {
	const id = crypto.randomUUID();
	const result = await db
		.prepare("INSERT INTO users (id, email, name, pass, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING")
		.bind(id, input.email, input.name, await hashPassword(input.password), new Date().toISOString())
		.run();
	return result.meta.changes === 1 ? id : null;
}

export async function startSession(db: D1Database, userId: string): Promise<string> {
	const token = hex(crypto.getRandomValues(new Uint8Array(32)));
	await db.batch([
		db.prepare("INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)").bind(await tokenHash(token), userId, now() + SESSION_TTL),
		db.prepare("DELETE FROM sessions WHERE expires < ?").bind(now()),
	]);
	return token;
}

export async function sessionUser(db: D1Database, token: string | undefined): Promise<User | null> {
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
	return db
		.prepare(`SELECT ${USER_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?`)
		.bind(await tokenHash(token), now())
		.first<User>();
}

export async function endSession(db: D1Database, token: string): Promise<void> {
	await db.prepare("DELETE FROM sessions WHERE hash = ?").bind(await tokenHash(token)).run();
}

export async function touch(db: D1Database, userId: string): Promise<void> {
	await db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(new Date().toISOString(), userId).run();
}

// ---- codes: six digits, ten minutes, five tries, one a minute

export async function newCode(env: CloudflareBindings, userId: string, kind: CodeKind): Promise<string> {
	const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
	await env.DB
		.prepare("INSERT INTO codes (user_id, kind, hash, expires, tries) VALUES (?, ?, ?, ?, 0) ON CONFLICT(user_id, kind) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, tries = 0")
		.bind(userId, kind, await sign(env, `c|${userId}|${kind}|${code}`), now() + CODE_TTL)
		.run();
	return code;
}

/** Seconds before another code of this kind may go out. */
export async function cooling(db: D1Database, userId: string, kind: CodeKind): Promise<number> {
	const row = await db.prepare("SELECT expires FROM codes WHERE user_id = ? AND kind = ?").bind(userId, kind).first<{ expires: number }>();
	return row ? Math.max(0, row.expires - CODE_TTL + CODE_COOLDOWN - now()) : 0;
}

/** True when `code` matches; every try counts. */
export async function useCode(env: CloudflareBindings, userId: string, kind: CodeKind, code: string): Promise<boolean> {
	const row = await env.DB
		.prepare("UPDATE codes SET tries = tries + 1 WHERE user_id = ? AND kind = ? AND tries < ? AND expires > ? RETURNING hash")
		.bind(userId, kind, CODE_TRIES, now())
		.first<{ hash: string }>();
	if (!row || !/^[0-9]{6}$/.test(code)) return false;
	if (!same(enc.encode(await sign(env, `c|${userId}|${kind}|${code}`)), enc.encode(row.hash))) return false;
	await env.DB.prepare("DELETE FROM codes WHERE user_id = ? AND kind = ?").bind(userId, kind).run();
	return true;
}

// ---- daily counters

/** One unit of `kind` for `who` today, unless `limit` is reached: the units left, or -1. */
export async function take(db: D1Database, who: string, kind: string, limit: number): Promise<number> {
	const row = await db
		.prepare("INSERT INTO usage (day, who, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, who, kind) DO UPDATE SET n = n + 1 WHERE n < ? RETURNING n")
		.bind(today(), who, kind, limit)
		.first<{ n: number }>();
	return row ? limit - row.n : -1;
}

export async function forget(db: D1Database, who: string, kind: string): Promise<void> {
	await db.prepare("DELETE FROM usage WHERE who = ? AND kind = ?").bind(who, kind).run();
}

// ---- entitlements

/** The free institution an email belongs to (`usp.br` for `x@icmc.usp.br`), or null. */
export function freeDomain(env: CloudflareBindings, email: string): string | null {
	const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
	if (!domain || !email.includes("@")) return null;
	const allowed = envString(env, "FREE_DOMAINS").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
	return allowed.find((item) => domain === item || domain.endsWith(`.${item}`)) ?? null;
}

export function isAdmin(env: CloudflareBindings, email: string): boolean {
	return String(env.ADMINS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

/**
 * Who pays for an analysis. Integrations Rubrion runs (rubry.ai, OpenWebUI without a user,
 * service tokens) and local development don't. People from a free institution don't.
 * Anyone else spends their account's credits: one per reviewer.
 */
export type Payer = { kind: "free"; institution: string | null } | { kind: "wallet"; userId: string } | { kind: "none" };

export async function payerFor(env: CloudflareBindings, actor: { id: string; kind: string }): Promise<Payer> {
	if (actor.kind !== "user") return { kind: "free", institution: null };
	if (actor.id.startsWith("rubry:")) return { kind: "free", institution: null };
	const email = actor.id.startsWith("openwebui:") ? actor.id.slice("openwebui:".length) : actor.id;
	const institution = freeDomain(env, email);
	if (institution) return { kind: "free", institution };
	const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND email_ok IS NOT NULL").bind(email).first<{ id: string }>();
	return user ? { kind: "wallet", userId: user.id } : { kind: "none" };
}

// ---- credits

export async function balance(db: D1Database, userId: string): Promise<number> {
	return (await db.prepare("SELECT n FROM wallets WHERE user_id = ?").bind(userId).first<{ n: number }>())?.n ?? 0;
}

/** Takes `n` credits for an analysis, or none when the balance is short. */
export async function charge(db: D1Database, userId: string, n: number, analysisId: string): Promise<boolean> {
	// One transaction: the ledger row is written only when the wallet had enough (changes() = 1).
	const [taken] = await db.batch([
		db.prepare("UPDATE wallets SET n = n - ? WHERE user_id = ? AND n >= ?").bind(n, userId, n),
		db.prepare("INSERT INTO ledger (ref, user_id, kind, n, analysis_id, created) SELECT ?, ?, 'charge', ?, ?, ? WHERE changes() = 1").bind(`charge:${analysisId}`, userId, -n, analysisId, new Date().toISOString()),
	]);
	return taken.meta.changes === 1;
}

/** Gives an analysis's credits back once (it failed, or never started). */
export async function refundAnalysis(db: D1Database, analysisId: string): Promise<number> {
	const charged = await db.prepare("SELECT user_id, n FROM ledger WHERE ref = ?").bind(`charge:${analysisId}`).first<{ user_id: string; n: number }>();
	if (!charged) return 0;
	const inserted = await db
		.prepare("INSERT INTO ledger (ref, user_id, kind, n, analysis_id, created) VALUES (?, ?, 'refund', ?, ?, ?) ON CONFLICT(ref) DO NOTHING")
		.bind(`refund:${analysisId}`, charged.user_id, -charged.n, analysisId, new Date().toISOString())
		.run();
	if (inserted.meta.changes !== 1) return 0;
	await deposit(db, charged.user_id, -charged.n);
	return -charged.n;
}

export async function deposit(db: D1Database, userId: string, n: number): Promise<void> {
	await db.prepare("INSERT INTO wallets (user_id, n) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET n = n + excluded.n").bind(userId, n).run();
}

export async function grant(db: D1Database, userId: string, n: number, note: string | null): Promise<void> {
	await db.batch([
		db.prepare("INSERT INTO ledger (ref, user_id, kind, n, note, created) VALUES (?, ?, 'grant', ?, ?, ?)").bind(`grant:${crypto.randomUUID()}`, userId, n, note, new Date().toISOString()),
		db.prepare("INSERT INTO wallets (user_id, n) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET n = n + excluded.n").bind(userId, n),
	]);
}

export async function history(db: D1Database, userId: string, limit = 50) {
	const { results } = await db
		.prepare("SELECT kind, n, analysis_id, note, created FROM ledger WHERE user_id = ? ORDER BY created DESC LIMIT ?")
		.bind(userId, limit)
		.all<{ kind: string; n: number; analysis_id: string | null; note: string | null; created: string }>();
	return results;
}
