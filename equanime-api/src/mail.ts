// Confirmation and password-reset codes, by Cloudflare Email Sending (the EMAIL binding) from
// no-reply@rubrion.ai. With OTP_LOG=1 (local dev, tests) the code is only logged.
import { envString } from "./settings";

const SUBJECT = { email: "confirmar seu e-mail", reset: "trocar sua senha" } as const;

export async function emailCode(env: CloudflareBindings, to: string, code: string, kind: keyof typeof SUBJECT): Promise<boolean> {
	if (envString(env, "OTP_LOG") === "1") {
		console.log(`equanime ${kind} code for ${to}: ${code}`);
		return true;
	}
	const text = `Seu código do Equânime para ${SUBJECT[kind]}: ${code}. Vale por 10 minutos. Não compartilhe.`;
	try {
		await env.EMAIL.send({
			to,
			from: { email: "no-reply@rubrion.ai", name: "Equânime" },
			subject: `${code} é o seu código do Equânime`,
			text,
			html: `<p style="font:16px system-ui">${text.replace(code, `<b style="font-size:24px;letter-spacing:4px">${code}</b>`)}</p>`,
		});
		return true;
	} catch (error) {
		console.log(`code not sent: ${error instanceof Error ? error.message : "unknown"}`);
		return false;
	}
}
