import { z } from "@hono/zod-openapi";

const lattesDescription =
	"Endereço público do Currículo Lattes, contendo o identificador de 16 dígitos. Exemplo: http://lattes.cnpq.br/1234567890123456.";

export const PersonSchema = z
	.object({
		name: z.string().min(3).openapi({
			description: "Nome da pessoa como informado pelo usuário. A API também compara esse nome com o nome encontrado no currículo.",
			example: "João da Silva",
		}),
		lattes_url: z.string().url().openapi({
			description: lattesDescription,
			example: "http://lattes.cnpq.br/1111111111111111",
		}),
		curriculum_ref: z.string().optional().openapi({
			description: "Opcional. Referência devolvida por POST /curriculos quando o usuário enviou o XML do currículo. Assistentes normalmente não usam este campo.",
		}),
	})
	.openapi("Person");

export const ReviewerInputSchema = PersonSchema.extend({
	role: z.enum(["titular", "suplente"]).openapi({
		description: "Função na banca. Use titular para membros efetivos e suplente para substitutos.",
		example: "titular",
	}),
}).openapi("ReviewerInput");

export const CreateAnalysisSchema = z
	.object({
		candidate: PersonSchema.openapi({
			description: "Candidato cuja relação com os avaliadores será analisada. Obrigatório.",
		}),
		advisor: PersonSchema.optional().openapi({
			description:
				"Orientador. Opcional. Quando informado, a análise é de banca acadêmica e a relação recente de orientação é verificada. Quando omitido, a análise é de concurso ou processo seletivo.",
		}),
		work_title: z.string().min(1).optional().openapi({
			description: "Título da tese ou dissertação. Opcional e usado no relatório acadêmico.",
		}),
		reviewers: z.array(ReviewerInputSchema).min(1).max(12).openapi({
			description: "Avaliadores sugeridos. Informe ao menos um, com o papel titular ou suplente.",
		}),
	})
	.openapi("CreateAnalysis");

export const EvidenceSchema = z
	.object({
		rule: z.enum(["coauthorship", "recent_advisor_relationship", "joint_research_projects"]),
		people: z.array(z.string()),
		record: z.string().openapi({ description: "Registro usado como evidência da decisão." }),
		year_or_period: z.string().nullable(),
		source_curriculum: z.string().openapi({ description: "Currículo Lattes do qual o registro foi obtido." }),
		consulted_at: z.string().nullable().openapi({ description: "Data da consulta ao currículo fonte." }),
		publication: z.string().optional(),
		authors: z.array(z.string()).optional(),
		project: z.string().optional(),
		institution: z.string().nullable().optional(),
		orientation_type: z.string().optional(),
		confidence: z.enum(["high", "medium"]),
		structured_record: z.unknown().openapi({
			description: "Registro estruturado preservado para conferência humana.",
		}),
	})
	.openapi("Evidence");

const CollectionStatusSchema = z.enum(["pending", "complete", "partial", "failed", "needs_upload"]).openapi({
	description: "complete, partial ou failed. needs_upload: nenhuma fonte automática leu o currículo (por exemplo, a Plataforma Lattes pediu verificação humana); o usuário pode enviar o XML na página da análise.",
});

const ParticipantSchema = z.object({
	name: z.string(),
	lattes_url: z.string(),
	collection_status: CollectionStatusSchema,
	collection_message: z.string().nullable(),
});

const RuleCheckSchema = z.object({
	detected: z.boolean(),
	inconclusive: z.boolean(),
	result: z.string().openapi({ description: "Resultado individual da regra, em linguagem natural." }),
	evidence: z.array(EvidenceSchema),
});

export const ReviewerResultSchema = z
	.object({
		reviewer: z.object({
			name: z.string(),
			detected_name: z.string().nullable(),
			role: z.enum(["titular", "suplente"]),
			lattes_url: z.string(),
			collection_status: CollectionStatusSchema,
			collection_message: z.string().nullable(),
		}),
		status: z.enum(["no_conflict_identified", "potential_conflict", "inconclusive"]),
		status_label: z.enum([
			"SEM CONFLITO IDENTIFICADO",
			"POSSÍVEL CONFLITO IDENTIFICADO",
			"ANÁLISE INCONCLUSIVA",
		]),
		checks: z.object({
			coauthorship: RuleCheckSchema,
			recent_advisor_relationship: RuleCheckSchema.extend({
				applicable: z.boolean().openapi({
					description: "Falsa em banca de concurso, quando não há orientador.",
				}),
			}),
			joint_research_projects: RuleCheckSchema,
		}),
	})
	.openapi("ReviewerResult");

export const AnalysisSchema = z
	.object({
		analysis_id: z.string().openapi({ description: "Identificador único da execução." }),
		type: z.enum(["academic", "selection"]).openapi({
			description: "academic quando há orientador; selection quando o orientador não foi informado.",
		}),
		status: z.enum([
			"pending",
			"collecting_lattes",
			"analyzing",
			"generating_report",
			"completed",
			"completed_with_warnings",
			"failed",
		]).openapi({
			description:
				"Estado atual. Enquanto não for completed, completed_with_warnings ou failed, consulte novamente este recurso.",
		}),
		message: z.string().openapi({ description: "Explicação do estado atual para o assistente e para o usuário." }),
		assistant_summary: z.string().nullable().openapi({
			description: "Síntese pronta para a resposta do assistente. Nula enquanto a análise não termina.",
		}),
		candidate: ParticipantSchema,
		advisor: ParticipantSchema.nullable(),
		work_title: z.string().nullable(),
		summary: z
			.object({
				reviewers_analyzed: z.number(),
				without_identified_conflict: z.number(),
				potential_conflict: z.number(),
				inconclusive: z.number(),
			})
			.nullable(),
		reviewers: z.array(ReviewerResultSchema),
		limitations: z.array(z.string()).openapi({
			description: "Limitações e falhas parciais. A ausência de evidência não comprova inexistência de conflito.",
		}),
		needs_upload: z.boolean().openapi({
			description: "Verdadeiro quando algum currículo precisa ser enviado pelo usuário. Nesse caso, oriente o usuário a abrir web_url, enviar o XML do Lattes e reprocessar.",
		}),
		web_url: z.string().nullable().openapi({ description: "Página da análise na aplicação web, para o usuário acompanhar e enviar currículos." }),
		report_url: z.string().nullable().openapi({
			description: "Caminho do PDF quando o relatório já foi gerado. Faça GET nesse caminho para obter o arquivo.",
		}),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.openapi("Analysis");

export const AnalysisListSchema = z
	.object({
		analyses: z.array(
			z.object({
				analysis_id: z.string(),
				type: z.enum(["academic", "selection"]),
				status: z.string(),
				candidate_name: z.string().nullable(),
				work_title: z.string().nullable(),
				summary: AnalysisSchema.shape.summary,
				web_url: z.string().nullable(),
				created_at: z.string(),
			}),
		),
	})
	.openapi("AnalysisList");

export const ErrorSchema = z
	.object({
		status: z.literal("error"),
		error_type: z.string(),
		message: z.string(),
	})
	.openapi("Error");

export type CreateAnalysisInput = z.infer<typeof CreateAnalysisSchema>;

export const UploadSchema = z
	.object({
		curriculum_ref: z.string().openapi({ description: "Referência do currículo enviado, para usar em curriculum_ref." }),
		lattes_id: z.string(),
		name: z.string().nullable(),
		updated_at: z.string().nullable().openapi({ description: "Data da última atualização do currículo no Lattes." }),
		publications: z.number(),
		projects: z.number(),
		advising: z.number(),
	})
	.openapi("CurriculumUpload");

export const ReprocessSchema = z
	.object({
		curriculum_refs: z.array(z.string()).max(20).default([]).openapi({
			description: "Currículos enviados por POST /curriculos. Cada um substitui a coleta do participante com o mesmo identificador Lattes.",
		}),
	})
	.openapi("Reprocess");
