import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runAnalysis } from "./pipeline";
import { logInfo } from "./log";

type Params = { analysisId: string };

export class AnalysisWorkflow extends WorkflowEntrypoint<CloudflareBindings, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<void> {
		const analysisId = event.payload.analysisId;
		logInfo("workflow_started", { analysis_id: analysisId, workflow_instance_id: event.instanceId });
		await step.do("collect-analyze-report", { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "15 minutes" }, async () => {
			await runAnalysis(this.env, analysisId);
			return { analysisId };
		});
	}
}
