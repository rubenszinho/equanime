import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { runAnalysis, type Runner } from "./pipeline";
import { logInfo } from "./log";

type Params = { analysisId: string };

export class AnalysisWorkflow extends WorkflowEntrypoint<CloudflareBindings, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<void> {
		const analysisId = event.payload.analysisId;
		logInfo("workflow_started", { analysis_id: analysisId, workflow_instance_id: event.instanceId });
		const runner: Runner = {
			// Step outputs must be serializable; the pipeline only returns plain data.
			do: (name, fn) => step.do(name, { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" }, fn as () => Promise<never>),
			sleep: (name, ms) => step.sleep(name, ms),
		};
		await runAnalysis(this.env, analysisId, runner);
	}
}
