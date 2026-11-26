import type { APIRoute } from "astro";
import { authorizeUrl, googleReady, STATE_COOKIE } from "../../../../lib/google";

export const prerender = false;

const safeBack = (value: string | null) => (value && /^\/(?!\/)[^\s]*$/.test(value) ? value : "/analises");

// Sends the visitor to Google, remembering where to come back to and a one-time state.
export const GET: APIRoute = ({ request, url, cookies, redirect }) => {
	if (!googleReady()) return redirect("/entrar?erro=google");
	const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
	cookies.set(STATE_COOKIE, `${state}|${safeBack(url.searchParams.get("volta"))}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/conta/google", maxAge: 600 });
	return redirect(authorizeUrl(request, state));
};
