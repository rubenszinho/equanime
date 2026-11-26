type Runtime = import("@astrojs/cloudflare").Runtime;

declare namespace App {
	interface Locals extends Runtime {
		/** The signed-in account, set by the middleware on private pages. */
		account?: import("./lib/session").Account;
	}
}
