const PARTICLES = new Set(["da", "de", "do", "das", "dos", "e", "di", "du"]);

export function fold(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function nameTokens(value: string): string[] {
	return fold(value)
		.split(" ")
		.filter((token) => token.length > 0 && !PARTICLES.has(token));
}

function isInitial(token: string, initial: string): boolean {
	return initial.length === 1 && token.startsWith(initial);
}

export type NameMatch = { match: boolean; confidence: "high" | "medium" | "low"; ambiguous: boolean };

export function matchNames(left: string, right: string): NameMatch {
	const a = nameTokens(left);
	const b = nameTokens(right);
	if (a.length < 2 || b.length < 2) return { match: false, confidence: "low", ambiguous: false };
	if (a.join(" ") === b.join(" ")) return { match: true, confidence: "high", ambiguous: false };
	if (a[a.length - 1] !== b[b.length - 1]) return { match: false, confidence: "low", ambiguous: false };

	const shorter = a.length <= b.length ? a : b;
	const longer = a.length <= b.length ? b : a;
	let index = 0;
	let usedInitial = false;
	for (const token of shorter.slice(0, -1)) {
		while (
			index < longer.length - 1 &&
			longer[index] !== token &&
			!isInitial(token, longer[index] ?? "") &&
			!isInitial(longer[index] ?? "", token)
		) {
			index += 1;
		}
		if (index >= longer.length - 1) {
			const ambiguous = a.some((token) => token.length === 1) || b.some((token) => token.length === 1);
			return { match: false, confidence: "low", ambiguous };
		}
		if (longer[index] !== token) usedInitial = true;
		index += 1;
	}
	return { match: true, confidence: usedInitial ? "medium" : "high", ambiguous: false };
}

export function titlesMatch(left: string, right: string): boolean {
	const a = fold(left);
	const b = fold(right);
	if (a.length < 8 || b.length < 8) return false;
	return a === b;
}

export function parseLattes(url: string): { ok: true; id: string } | { ok: false } {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false };
	}
	if (!parsed.hostname.toLowerCase().endsWith("cnpq.br")) return { ok: false };
	const id = (parsed.pathname + parsed.search).match(/[0-9]{16}/)?.[0];
	if (!id) return { ok: false };
	return { ok: true, id };
}

export function endYear(year: number | null, period: string | null): number | null {
	if (year) return year;
	if (!period) return null;
	const years = [...period.matchAll(/[0-9]{4}/g)].map((match) => Number(match[0]));
	if (years.length === 0) return null;
	return Math.max(...years);
}

export async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deterministicId(key: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`equanime:${key}`));
	const bytes = new Uint8Array(digest).slice(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
	}
	return JSON.stringify(value);
}
