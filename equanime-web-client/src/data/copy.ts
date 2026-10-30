// Every user-facing string. The product serves Brazilian boards, so PT-BR only.

export const site = {
	name: "Equânime",
	description: "Verifique conflitos de interesse em bancas acadêmicas e de concurso a partir dos Currículos Lattes, com evidências que uma pessoa pode conferir.",
	by: "Feito pela Rubrion",
	byUrl: "https://rubrion.ai",
	nav: { how: "Como funciona", start: "Nova análise", dark: "Usar tema escuro", light: "Usar tema claro" },
};

export const home = {
	title: "Equânime: conflito de interesses em bancas",
	headline: "Antes de aprovar a banca, veja o que os currículos dizem.",
	lead: "A Equânime lê os Currículos Lattes do candidato, do orientador e dos avaliadores, aplica três regras de conflito de interesses e entrega um relatório com cada evidência no lugar de onde veio.",
	start: "Analisar uma banca",
	how: "Ver como funciona",
	sheet: {
		caption: "Exemplo de resultado",
		kind: "Banca de doutorado",
		candidate: "Candidata",
		advisor: "Orientador",
		titulares: "Titulares",
		suplentes: "Suplentes",
		people: {
			candidate: "Helena Prado",
			advisor: "Marcos Vieira",
			titulares: [
				{ name: "Beatriz Lemos", status: "no_conflict_identified" },
				{ name: "Rafael Costa", status: "potential_conflict", why: "coautoria em 2024" },
				{ name: "Sônia Queiroz", status: "no_conflict_identified" },
			],
			suplentes: [
				{ name: "Túlio Andrade", status: "inconclusive", why: "currículo não lido" },
				{ name: "Lívia Martins", status: "potential_conflict", why: "orientada pelo orientador em 2023" },
			],
		},
	},
	stepsTitle: "Como funciona",
	steps: [
		{ title: "Informe a banca", body: "Candidato, avaliadores titulares e suplentes, cada um com o endereço do Currículo Lattes. Orientador e título são opcionais." },
		{ title: "Os currículos são lidos", body: "Pelo extrator institucional do CNPq quando disponível. Quando um currículo não pode ser lido, você envia o XML que baixa no próprio Lattes." },
		{ title: "Você confere o relatório", body: "Cada avaliador recebe um resultado por regra, com a publicação, o projeto ou a orientação que o motivou. O PDF fica pronto para anexar ao processo." },
	],
	rulesTitle: "As três regras",
	rulesLead: "As regras são aplicadas pelo serviço, sempre da mesma forma. Um modelo de linguagem só ajuda a decidir se dois nomes escritos de jeitos diferentes são a mesma pessoa.",
	rules: [
		{ title: "Coautoria com o candidato", body: "Publicações em que o avaliador e o candidato aparecem como autores, em qualquer um dos dois currículos." },
		{ title: "Relação recente com o orientador", body: "Mestrado, doutorado ou pós-doutorado do avaliador orientado pelo orientador do candidato nos últimos cinco anos. Só em bancas com orientador." },
		{ title: "Projeto de pesquisa conjunto", body: "Projetos de pesquisa em que o candidato e o avaliador aparecem como integrantes da mesma equipe." },
	],
	resultsTitle: "O que cada resultado quer dizer",
	results: {
		no_conflict_identified: "Nenhuma das regras encontrou evidência nos currículos consultados. Não é prova de que o conflito não existe.",
		potential_conflict: "Ao menos uma regra encontrou um registro. O relatório mostra qual, de qual currículo e de quando.",
		inconclusive: "Faltou informação para concluir, por exemplo um currículo que não pôde ser lido. Nunca é tratado como ausência de conflito.",
	},
	namesTitle: "Nomes escritos de várias formas",
	namesBody: "Ricardo Marcacini, Ricardo M. Marcacini e MARCACINI, R. M. são reconhecidos como a mesma pessoa. Quando o Lattes traz o identificador de 16 dígitos de um coautor, a identificação é exata.",
	dataTitle: "Dados e limites",
	data: [
		"Os currículos lidos, os resultados e o PDF ficam guardados por 90 dias e depois são apagados.",
		"Cada análise só pode ser aberta por quem a criou.",
		"A Equânime não contorna a verificação humana da Plataforma Lattes. Quando ela aparece, o currículo é marcado para envio manual.",
		"O resultado é apoio à decisão. A composição da banca é aprovada por uma pessoa.",
	],
	chatTitle: "Também no assistente",
	chatBody: "A mesma análise está disponível como ferramenta OpenAPI para o OpenWebUI. O assistente Análise de Banca recebe os dados na conversa, inicia a análise e devolve o resumo e o PDF.",
};

export const statusLabels: Record<string, string> = {
	pending: "Na fila",
	collecting_lattes: "Lendo os currículos",
	analyzing: "Aplicando as regras",
	generating_report: "Gerando o relatório",
	completed: "Concluída",
	completed_with_warnings: "Concluída com ressalvas",
	failed: "Não concluída",
};

export const steps = ["collecting_lattes", "analyzing", "generating_report", "completed"] as const;

export const results = {
	no_conflict_identified: "Sem conflito identificado",
	potential_conflict: "Possível conflito identificado",
	inconclusive: "Análise inconclusiva",
} as const;

export const roles: Record<string, string> = { titular: "Titular", suplente: "Suplente" };

export const collection: Record<string, string> = {
	pending: "Aguardando leitura",
	complete: "Currículo lido",
	partial: "Currículo lido em parte",
	failed: "Currículo não lido",
	needs_upload: "Envie o XML do currículo",
};

export const ruleTitles = {
	coauthorship: "Coautoria com o candidato",
	recent_advisor_relationship: "Relação recente com o orientador",
	joint_research_projects: "Projeto de pesquisa conjunto",
} as const;

export const form = {
	title: "Nova análise",
	pageTitle: "Nova análise de banca",
	lead: "Informe as pessoas da banca e o endereço do Currículo Lattes de cada uma. O endereço tem a forma http://lattes.cnpq.br/ seguida de 16 dígitos.",
	candidate: "Candidato",
	advisor: "Orientador",
	advisorHint: "Opcional. Com orientador, a análise é de banca acadêmica e verifica a relação recente de orientação. Sem orientador, é de concurso ou processo seletivo.",
	work: "Título da tese ou dissertação",
	workHint: "Opcional. Aparece no relatório.",
	reviewers: "Avaliadores",
	reviewersHint: "Até 12 pessoas, titulares e suplentes.",
	name: "Nome",
	lattes: "Currículo Lattes",
	lattesPlaceholder: "http://lattes.cnpq.br/0000000000000000",
	role: "Papel",
	add: "Adicionar avaliador",
	remove: "Remover",
	example: "Preencher com um exemplo",
	submit: "Analisar banca",
	submitting: "Enviando a banca",
	kindAcademic: "Será analisada como banca acadêmica.",
	kindSelection: "Será analisada como banca de concurso ou processo seletivo.",
	errors: {
		candidateName: "Informe o nome do candidato.",
		candidateLattes: "Informe o Currículo Lattes do candidato, com os 16 dígitos.",
		advisorName: "Informe o nome do orientador ou deixe os dois campos em branco.",
		advisorLattes: "O Currículo Lattes do orientador precisa ter os 16 dígitos.",
		reviewers: "Informe ao menos um avaliador.",
		reviewer: (index: number) => `Revise o nome e o Currículo Lattes do avaliador ${index}.`,
		duplicate: "O mesmo currículo aparece mais de uma vez entre os avaliadores.",
		self: "O candidato não pode ser avaliador da própria banca.",
		session: "Sua sessão expirou. Recarregue a página para entrar de novo.",
		network: "A Equânime não respondeu. Verifique a conexão e tente de novo.",
		rejected: "A análise não foi aceita.",
	},
};

export const view = {
	pageTitle: "Análise de banca",
	loading: "Abrindo a análise",
	notFound: "Esta análise não existe ou foi criada por outra pessoa.",
	retrying: "Sem resposta da Equânime. Tentando de novo.",
	academic: "Banca acadêmica",
	selection: "Banca de concurso ou processo seletivo",
	candidate: "Candidato",
	advisor: "Orientador",
	workTitle: "Título",
	reviewers: "Avaliadores",
	summary: {
		analyzed: "avaliadores analisados",
		none: "sem conflito identificado",
		potential: "com possível conflito",
		inconclusive: "inconclusivos",
	},
	pdf: "Abrir o relatório em PDF",
	evidence: "Evidências",
	noEvidence: "Nenhuma evidência nas fontes consultadas.",
	notApplicable: "Não se aplica: banca sem orientador.",
	source: "Fonte",
	consulted: "consultado em",
	people: "Pessoas",
	authors: "Autores",
	institution: "Instituição",
	check: "Identificado por semelhança de nome ou título: confira.",
	limitations: "Limitações",
	newAnalysis: "Analisar outra banca",
	upload: {
		title: "Currículos para enviar",
		lead: "Estes currículos não puderam ser lidos automaticamente. Abra cada um no Lattes, use o botão XML no topo da página (o Lattes pede uma verificação humana) e envie o arquivo aqui.",
		open: "Abrir no Lattes",
		choose: "Escolher o XML",
		sent: (name: string | null, publications: number) => `Recebido${name ? `: ${name}` : ""}, ${publications} publicações.`,
		error: "Este arquivo não foi aceito.",
		reprocess: "Analisar de novo com os arquivos enviados",
		reprocessing: "Reenviando",
	},
	failed: "A análise não foi concluída por um erro interno. Nenhuma ausência de conflito foi presumida.",
	retry: "Tentar de novo",
};

export const notFound = {
	title: "Página não encontrada",
	body: "O endereço não leva a nenhuma página da Equânime.",
	home: "Voltar ao início",
};

export const assistant = {
	subtitle: "Análise de Banca",
	expanded: "Assistente da Equânime",
	close: "Fechar o assistente",
	greeting: (first: string) => (first ? `Olá, ${first}. Qual banca vamos verificar?` : "Qual banca vamos verificar?"),
	hint: "Informe o candidato, os avaliadores (titular ou suplente) e, em banca acadêmica, o orientador, com os links do Lattes.",
	suggestions: ["Quero verificar uma banca", "Quais análises eu já fiz?", "Como funciona a verificação?"],
	explain: "Explique o resultado desta análise",
	tools: {
		criar_analise: ["Registrando a análise", "Análise registrada"],
		consultar_analise: ["Consultando a análise", "Análise consultada"],
		minhas_analises: ["Buscando suas análises", "Análises encontradas"],
	} as Record<string, [string, string]>,
};
