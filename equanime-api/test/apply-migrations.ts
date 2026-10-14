import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, (env as CloudflareBindings & { TEST_MIGRATIONS: { name: string; queries: string[] }[] }).TEST_MIGRATIONS);
