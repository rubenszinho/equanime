import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Actor } from "../auth";
import { LattesParseError, decodeLattes, parseLattesXml } from "../lattes";
import { insertUpload } from "../repository";
import { ErrorSchema, UploadSchema } from "../schemas";
import { logInfo } from "../log";

type AppEnv = { Bindings: CloudflareBindings; Variables: { actor: Actor } };

export const UPLOAD_LIMIT = 10 * 1024 * 1024;

const uploadRouteDef = createRoute({
	method: "post",
	path: "/curriculos",
	tags: ["Currículos"],
	summary: "Envia o XML de um Currículo Lattes",
	description: "Usado pela aplicação web quando a coleta automática não leu um currículo (needs_upload). O usuário baixa o XML na página do currículo no Lattes, resolvendo ele mesmo a verificação humana, e envia o arquivo aqui. Assistentes de chat não enviam arquivos: oriente o usuário a abrir web_url.",
	request: {
		body: {
			content: {
				"multipart/form-data": {
					schema: z.object({ file: z.any().openapi({ type: "string", format: "binary", description: "XML do Lattes, ou o ZIP que o Lattes entrega, até 10 MB." }) }),
				},
			},
			required: true,
		},
	},
	responses: {
		201: { description: "Currículo lido e guardado.", content: { "application/json": { schema: UploadSchema } } },
		400: { description: "O arquivo não é um currículo Lattes legível.", content: { "application/json": { schema: ErrorSchema } } },
		413: { description: "Arquivo grande demais.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

export const curriculumRoutes = new OpenAPIHono<AppEnv>();

curriculumRoutes.openapi(uploadRouteDef, async (c) => {
	const form = await c.req.parseBody();
	const file = form.file;
	if (!(file instanceof File)) return c.json({ status: "error" as const, error_type: "file_missing", message: "Envie o arquivo no campo file." }, 400);
	if (file.size > UPLOAD_LIMIT) return c.json({ status: "error" as const, error_type: "file_too_large", message: "O arquivo passa de 10 MB." }, 413);
	const bytes = new Uint8Array(await file.arrayBuffer());
	let curriculum;
	try {
		curriculum = parseLattesXml(decodeLattes(bytes), { name: "", lattesUrl: "", consultedAt: new Date().toISOString(), source: "upload" });
	} catch (error) {
		const message = error instanceof LattesParseError ? error.message : "O arquivo não pôde ser lido como currículo Lattes.";
		return c.json({ status: "error" as const, error_type: "unreadable_curriculum", message }, 400);
	}
	const id = crypto.randomUUID();
	const key = `uploads/${id}`;
	// The original file is kept: the analysis parses it again, and a person can audit it.
	await c.env.EVIDENCE.put(key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });
	const at = new Date().toISOString();
	await insertUpload(c.env.DB, { id, actor: c.get("actor").id, lattes_id: curriculum.lattes_id, detected_name: curriculum.detected_name, object_key: key, created_at: at });
	logInfo("curriculum_uploaded", { upload_id: id, publications: curriculum.publications.length, projects: curriculum.projects.length, advising: curriculum.advising.length });
	return c.json({
		curriculum_ref: id,
		lattes_id: curriculum.lattes_id,
		name: curriculum.detected_name,
		updated_at: curriculum.lattes_updated_at ?? null,
		publications: curriculum.publications.length,
		projects: curriculum.projects.length,
		advising: curriculum.advising.length,
	}, 201);
});
