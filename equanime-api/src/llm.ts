import { recordModelCall } from "./repository";
import { logError, logInfo } from "./log";
import { under } from "./collector";
import { envString } from "./settings";

export async function resolveAmbiguousIdentity(env: CloudflareBindings, analysisId: string, left: string, right: string): Promise<boolean> {
	const model = envString(env, "LLM_MODEL");
	const baseUrl = envString(env, "LLM_BASE_URL");
	if (!env.LLM_API_KEY || !baseUrl || !model) return false;
	const started = Date.now();
	try {
		const response = await fetch(under(baseUrl, "chat/completions"), {
			method: "POST",
			signal: AbortSignal.timeout(20_000),
			headers: { authorization: `Bearer ${env.LLM_API_KEY}`, "content-type": "application/json" },
			body: JSON.stringify({
				model,
				temperature: 0,
				messages: [{
					role: "user",
					content: `Os nomes a seguir identificam a mesma pessoa? Responda apenas sim ou nao.\n1. ${left}\n2. ${right}`,
				}],
			}),
		});
		if (!response.ok) throw new Error(`llm_${response.status}`);
		const body = await response.json<{ choices?: Array<{ message?: { content?: string } }> }>();
		const answer = body.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
		const same = answer.startsWith("sim");
		await recordModelCall(env.DB, analysisId, model, "identity", "success", Date.now() - started, new Date().toISOString());
		logInfo("llm_call", { analysis_id: analysisId, model, purpose: "identity", status: "success" });
		return same;
	} catch (error) {
		await recordModelCall(env.DB, analysisId, model, "identity", "failed", Date.now() - started, new Date().toISOString());
		logError("llm_call", { analysis_id: analysisId, model, purpose: "identity", status: "failed", error: error instanceof Error ? error.message : "unknown" });
		return false;
	}
}
