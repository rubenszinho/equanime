import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Actor } from "../auth";
import { getDocument, insertDocument } from "../repository";
import { DocumentSchema, ErrorSchema } from "../schemas";
import { logInfo } from "../log";

type AppEnv = { Bindings: CloudflareBindings; Variables: { actor: Actor } };

export const DOCUMENT_LIMIT = 10 * 1024 * 1024;

// What the agent can turn into text (Workers AI toMarkdown): by extension, since browsers
// often send an empty or generic type.
const KINDS: Record<string, string> = {
	pdf: "application/pdf",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	odt: "application/vnd.oasis.opendocument.text",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ods: "application/vnd.oasis.opendocument.spreadsheet",
	csv: "text/csv",
	txt: "text/plain",
	md: "text/markdown",
	html: "text/html",
	htm: "text/html",
};

const kindOf = (name: string) => KINDS[name.toLowerCase().split(".").pop() ?? ""];

const uploadRouteDef = createRoute({
	method: "post",
	path: "/documentos",
	tags: ["Documentos"],
	summary: "Envia um documento sobre a banca",
	description: "Usado pelo chat da aplicação web: um edital, uma ata ou uma lista da banca (PDF, Word, ODT, planilha, CSV, texto), até 10 MB. O assistente lê o documento para montar a análise; o documento não entra na verificação de conflitos.",
	request: {
		body: {
			content: { "multipart/form-data": { schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }) } },
			required: true,
		},
	},
	responses: {
		201: { description: "Documento guardado.", content: { "application/json": { schema: DocumentSchema } } },
		400: { description: "Arquivo ausente ou de um tipo que não é lido.", content: { "application/json": { schema: ErrorSchema } } },
		413: { description: "Arquivo grande demais.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

const fileRouteDef = createRoute({
	method: "get",
	path: "/documentos/{document_id}/arquivo",
	tags: ["Documentos"],
	summary: "O arquivo de um documento enviado",
	description: "Só para quem o enviou.",
	request: { params: z.object({ document_id: z.string().uuid() }) },
	responses: {
		200: { description: "O arquivo original." },
		404: { description: "Documento não encontrado.", content: { "application/json": { schema: ErrorSchema } } },
	},
});

export const documentRoutes = new OpenAPIHono<AppEnv>();

documentRoutes.openapi(uploadRouteDef, async (c) => {
	const form = await c.req.parseBody();
	const file = form.file;
	if (!(file instanceof File)) return c.json({ status: "error" as const, error_type: "file_missing", message: "Envie o arquivo no campo file." }, 400);
	if (file.size > DOCUMENT_LIMIT) return c.json({ status: "error" as const, error_type: "file_too_large", message: "O arquivo passa de 10 MB." }, 413);
	const type = kindOf(file.name);
	if (!type || !file.size) return c.json({ status: "error" as const, error_type: "unsupported_document", message: "Envie um PDF, Word, ODT, planilha, CSV ou texto." }, 400);
	const id = crypto.randomUUID();
	const key = `documents/${id}`;
	const name = file.name.replace(/[\r\n]/g, " ").slice(0, 200);
	await c.env.EVIDENCE.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
	await insertDocument(c.env.DB, { id, actor: c.get("actor").id, name, content_type: type, size: file.size, object_key: key, created_at: new Date().toISOString() });
	logInfo("document_uploaded", { document_id: id, content_type: type, size: file.size });
	return c.json({ document_ref: id, name, content_type: type, size: file.size }, 201);
});

documentRoutes.openapi(fileRouteDef, async (c) => {
	const row = await getDocument(c.env.DB, c.req.valid("param").document_id);
	const object = row && row.actor === c.get("actor").id ? await c.env.EVIDENCE.get(row.object_key) : null;
	if (!row || !object) return c.json({ status: "error" as const, error_type: "not_found", message: "Documento não encontrado." }, 404);
	return new Response(object.body, {
		headers: { "content-type": row.content_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "cache-control": "private, no-store" },
	}) as never;
});
