import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
	const migrations = await readD1Migrations("./migrations");
	return {
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.jsonc" },
					miniflare: {
						// wrangler.jsonc is production; tests run like local dev.
						bindings: {
							TEST_MIGRATIONS: migrations,
							AUTH_MODE: "dev",
							EXECUTION_MODE: "manual",
							COLLECTOR_MODE: "fixture",
							WEB_URL: "https://equanime.test",
						},
					},
				},
			},
		},
	};
});
