import { createApp } from "./app";
import { purgeExpired } from "./retention";
import { logError, logInfo } from "./log";

export { AnalysisWorkflow } from "./workflow";

const app = createApp();

export default {
	fetch: app.fetch,
	async scheduled(_controller: ScheduledController, env: CloudflareBindings, ctx: ExecutionContext) {
		ctx.waitUntil((async () => {
			try {
				const purged = await purgeExpired(env);
				logInfo("retention_completed", { purged });
			} catch (error) {
				logError("retention_failed", { error: error instanceof Error ? error.message : "unknown" });
			}
		})());
	},
} satisfies ExportedHandler<CloudflareBindings>;
