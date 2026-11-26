import { defineMiddleware } from "astro:middleware";
import { currentAccount } from "./lib/session";

// Pages that need a confirmed account; the home page, sign-in and the API routes handle themselves.
const PRIVATE = /^\/(analises|conta|admin)(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname, search } = context.url;
	if (context.isPrerendered || !PRIVATE.test(pathname)) return next();
	const account = await currentAccount(context.request);
	if (!account?.confirmed) {
		const back = encodeURIComponent(pathname + search);
		return context.redirect(`/entrar?volta=${back}${account ? "&confirmar=1" : ""}`);
	}
	if (pathname.startsWith("/admin") && !account.admin) return context.redirect("/conta");
	context.locals.account = account;
	return next();
});
