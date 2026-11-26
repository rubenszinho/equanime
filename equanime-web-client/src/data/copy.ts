// Every user-facing string. The product serves Brazilian boards, so PT-BR only.

export const site = {
	name: "Equânime",
	description: "Verifique conflitos de interesse em bancas acadêmicas e de concurso a partir dos Currículos Lattes, com evidências que uma pessoa pode conferir.",
	by: "Feito pela Rubrion",
	byUrl: "https://rubrion.ai",
	nav: { how: "Como funciona", start: "Nova análise", mine: "Minhas análises", account: "Conta", signIn: "Entrar", dark: "Usar tema escuro", light: "Usar tema claro" },
};

export const home = {
	title: "Equânime: conflito de interesses em bancas",
	headline: "Antes de aprovar a banca, veja o que os currículos dizem.",
	lead: "A Equânime lê os Currículos Lattes do candidato, do orientador e dos avaliadores, aplica três regras de conflito de interesses e entrega um relatório com cada evidência no lugar de onde veio.",
	start: "Analisar uma banca",
	how: "Ver como funciona",
	video: "Ver o vídeo",
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
		{ title: "Os currículos são lidos", body: "Automaticamente, na Plataforma Lattes do CNPq, em cerca de 20 segundos cada. Quando o Lattes pede uma verificação humana, você envia o XML que baixa no próprio currículo." },
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
		"Os currículos lidos, os resultados e o PDF ficam guardados por 90 dias e depois são apagados. Cada análise mostra a data, para você guardar o PDF antes.",
		"Cada análise fica na conta de quem a criou e só pode ser aberta por essa pessoa.",
		"Quem entra com e-mail da USP (@usp.br ou de uma unidade, como @icmc.usp.br) usa sem limite. Outras contas usam créditos: um por avaliador analisado.",
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
		credits: "Ver créditos na sua conta",
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
	more: (next: number, rest: number) => (next === rest ? `Ver mais ${rest}` : `Ver mais ${next} de ${rest}`),
	less: "Ver menos",
	showing: (shown: number, total: number) => `${shown} de ${total}`,
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
	expires: (date: string, days: number) => `Esta análise, os currículos lidos e o relatório serão apagados em ${date} (${days <= 1 ? "em menos de um dia" : `em ${days} dias`}).`,
	expiresSave: "Baixe o PDF para guardá-lo.",
};

// The deletion warning turns prominent in the last two weeks.
export const EXPIRY_WARNING_DAYS = 14;

export const cost = {
	free: (institution: string) => `Uso ilimitado: e-mail institucional (${institution}).`,
	needs: (needed: number, credits: number) => `Esta análise usa ${needed} crédito${needed === 1 ? "" : "s"} (1 por avaliador). Você tem ${credits}.`,
	short: "Créditos insuficientes.",
};

export const login = {
	pageTitle: "Entrar",
	signIn: { title: "Entrar na Equânime", submit: "Entrar", switch: "Ainda não tem conta?", switchAction: "Criar conta" },
	register: {
		title: "Criar conta",
		lead: "Com e-mail da USP (@usp.br ou de uma unidade, como @icmc.usp.br) o uso é ilimitado e gratuito. Outros e-mails recebem créditos conforme combinado com a Rubrion.",
		submit: "Criar conta",
		switch: "Já tem conta?",
		switchAction: "Entrar",
	},
	confirm: {
		title: "Confirme seu e-mail",
		lead: (email: string) => `Enviamos um código de 6 dígitos para ${email || "o seu e-mail"}. Ele vale por 10 minutos.`,
		submit: "Confirmar",
		resend: "Enviar outro código",
		resent: "Código enviado.",
		other: "Usar outra conta",
	},
	forgot: {
		title: "Trocar a senha",
		lead: "Informe o e-mail da conta. Enviaremos um código para criar uma senha nova.",
		send: "Enviar código",
		code: "Código recebido por e-mail",
		password: "Senha nova",
		submit: "Trocar senha e entrar",
		link: "Esqueci a senha",
		back: "Voltar para entrar",
	},
	name: "Nome",
	email: "E-mail",
	password: "Senha",
	passwordHint: "Pelo menos 8 caracteres.",
	code: "Código",
	working: "Aguarde",
	network: "A Equânime não respondeu. Verifique a conexão e tente de novo.",
};

export const account = {
	pageTitle: "Sua conta",
	title: "Sua conta",
	since: (date: string) => `Conta criada em ${date}.`,
	planTitle: "Uso",
	unlimited: (institution: string) => `Ilimitado: e-mail institucional (${institution}). As análises não usam créditos.`,
	credits: (n: number) => `${n} crédito${n === 1 ? "" : "s"}`,
	creditsLead: "Cada avaliador analisado usa um crédito. Uma análise que falha devolve os créditos. Reanalisar não custa nada.",
	ask: "Para receber créditos, escreva para",
	contact: "hello@rubrion.ai",
	historyTitle: "Histórico de créditos",
	historyEmpty: "Nenhum movimento ainda.",
	kinds: { grant: "Créditos recebidos", charge: "Análise", refund: "Devolução (análise falhou)" } as Record<string, string>,
	retention: (days: number) => `As análises ficam guardadas por ${days} dias a partir da criação e depois são apagadas, com os currículos lidos e o relatório.`,
	mine: "Ver minhas análises",
	signOut: "Sair",
	deleteTitle: "Apagar a conta",
	deleteLead: "Apaga a conta e todas as suas análises, currículos enviados e relatórios. Não pode ser desfeito.",
	deletePassword: "Senha para confirmar",
	deleteSubmit: "Apagar a conta e as análises",
	admin: "Administração",
};

export const mine = {
	pageTitle: "Minhas análises",
	title: "Minhas análises",
	lead: (days: number) => `As análises são apagadas ${days} dias depois de criadas. Baixe o PDF das que precisar guardar.`,
	empty: "Você ainda não fez nenhuma análise.",
	start: "Analisar uma banca",
	loading: "Carregando",
	candidate: "Candidato",
	untitled: "Banca sem título",
	created: "Criada em",
	expires: "Apagada em",
	soon: (days: number) => (days <= 1 ? "Apagada em menos de um dia" : `Apagada em ${days} dias`),
	error: "Não foi possível carregar as análises.",
};

export const admin = {
	pageTitle: "Administração",
	title: "Contas",
	email: "E-mail",
	name: "Nome",
	credits: "Créditos",
	analyses: "Análises",
	free: "Ilimitado",
	unconfirmed: "e-mail não confirmado",
	grantTitle: "Dar ou retirar créditos",
	amount: "Créditos (negativo retira)",
	note: "Observação",
	submit: "Aplicar",
	done: (email: string, n: number) => `${email} agora tem ${n} créditos.`,
};

export const intro = {
	title: "A Equânime em três minutos",
	lead: "Uma banca do formulário ao relatório, e a mesma análise feita numa conversa com o assistente.",
	captions: "Português",
	close: "Fechar o vídeo",
	start: "Analisar uma banca",
	later: "Agora não",
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
	hint: "Informe o candidato, os avaliadores (titular ou suplente) e, em banca acadêmica, o orientador, com os links do Lattes. Se a Plataforma Lattes pedir verificação, anexe o XML de cada currículo pelo clipe. Também dá para anexar o edital ou a ata em PDF ou Word: o assistente tira a banca dele.",
	suggestions: ["Quero verificar uma banca", "Quais análises eu já fiz?", "Como funciona a verificação?"],
	explain: "Explique o resultado desta análise",
	attached: (name: string, lattes: string, publications: number, ref: string) => `📎 Currículo Lattes anexado: ${name} (Lattes ${lattes}, ${publications} publicações). curriculum_ref: ${ref}`,
	document: (name: string, ref: string) => `📄 Documento anexado: ${name}. document_ref: ${ref}`,
	tools: {
		ler_documento: ["Lendo o documento", "Documento lido"],
		criar_analise: ["Registrando a análise", "Análise registrada"],
		consultar_analise: ["Consultando a análise", "Análise consultada"],
		minhas_analises: ["Buscando suas análises", "Análises encontradas"],
		reprocessar_analise: ["Reprocessando com os currículos", "Análise reenviada"],
	} as Record<string, [string, string]>,
};
