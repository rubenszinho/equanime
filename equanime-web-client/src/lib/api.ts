import { form } from "../data/copy";

export type Reply<T> = { ok: true; status: number; body: T } | { ok: false; status: number; message: string };

// Every call goes through the site's /api proxy, which answers JSON; 401 means the session ended.
export async function api<T>(path: string, init?: RequestInit): Promise<Reply<T>> {
	let response: Response;
	try {
		response = await fetch(`/api${path}`, init);
	} catch {
		return { ok: false, status: 0, message: form.errors.network };
	}
	if (response.status === 401) return { ok: false, status: 401, message: form.errors.session };
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return { ok: false, status: response.status, message: form.errors.network };
	}
	if (!response.ok) return { ok: false, status: response.status, message: (body as { message?: string })?.message ?? form.errors.rejected };
	return { ok: true, status: response.status, body: body as T };
}
