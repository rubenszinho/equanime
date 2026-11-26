import { EXPIRY_WARNING_DAYS } from "../data/copy";

const DAY = 24 * 60 * 60 * 1000;

export const day = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/** Whole days until `iso` (at least 0), and whether it is close enough to warn. */
export function untilDeletion(iso: string, now = Date.now()) {
	const days = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY));
	return { days, soon: days <= EXPIRY_WARNING_DAYS };
}
