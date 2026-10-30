# Validação com o OpenWebUI de cortex.icmc.usp.br

A API roda como Worker em `api.equanime.rubrion.ai`; o OpenWebUI de produção do ICMC
(`cortex.icmc.usp.br`) a registra pela URL do `openapi.json`. O coletor do extrator
institucional do CNPq roda em servidor da Rubrion com IP fixo.

O item da issue "O serviço OpenAPI é instalado no ambiente cortex.icmc.usp.br" é atendido
pelo registro da ferramenta no OpenWebUI de cortex. Se o ICMC exigir execução nas próprias
máquinas, o coletor (imagem Docker) pode rodar lá; a API precisaria de `workerd` ou de uma
conta Cloudflare do ICMC. Combinar com o orientador.

## Pré-requisitos

1. Recursos Cloudflare criados (D1 `equanime`, R2 `equanime-evidence`, Workflow), migrações aplicadas. Feito em 30/10/2026.
2. Access em `equanime.rubrion.ai` (código por e-mail; `@usp.br`, `@icmc.usp.br` e o responsável) e seu AUD em `POLICY_AUD`. Feito.
3. Segredos do Worker: `OPENWEBUI_KEY`, `COLLECTOR_TOKEN`, `COLLECTOR_ACCESS_SECRET`, `LLM_API_KEY`. Também no Infisical (`/equanime`).
4. Coletor no ar (`~/rubrion/infra/instances/oracle-rubrion-1/equanime-collector`).
5. **Autorização do CNPq**: a USP pede ao CNPq acesso do IP `144.22.250.174` ao extrator de currículos (WSCurriculo). Enquanto não houver, `COLLECTOR_MODE=upload` e os usuários enviam o XML pela aplicação web.

## Registro no OpenWebUI de cortex (com o orientador)

1. Admin → Settings → Tools → adicionar Tool Server OpenAPI: `https://api.equanime.rubrion.ai/openapi.json`, autenticação Bearer com a `OPENWEBUI_KEY`.
2. Workspace → Models → novo modelo **Análise de Banca**, prompt de sistema = `openwebui/analise-de-banca.md`, ferramenta habilitada.

## Roteiro de aceite

- [ ] `GET /health` e `GET /ready` respondem 200.
- [ ] O OpenWebUI importa o `openapi.json` e lista `POST /analises`, `GET /analises/{analysis_id}`, `GET /analises/{analysis_id}/relatorio.pdf`, `POST /analises/{analysis_id}/reprocessar`.
- [ ] Banca acadêmica descrita em linguagem natural (exemplo da issue, com titulares e suplentes): o assistente chama a ferramenta, acompanha o estado e responde com a síntese.
- [ ] Banca de concurso (sem orientador): a regra de orientação não é executada.
- [ ] Coautoria, orientação nos últimos cinco anos e projeto conjunto aparecem com evidência na resposta e no PDF.
- [ ] Currículo não lido: avaliador ANÁLISE INCONCLUSIVA, `needs_upload` e `web_url`; envio do XML na aplicação web e nova análise resolvem.
- [ ] O PDF abre a partir da conversa, com acentos, tipo de banca, participantes, evidências, limitações e data.
- [ ] Observabilidade (Workers Logs): `analysis_created`, `analysis_completed` com tempos, regras, contagem de currículos e conflitos; `llm_call` com o modelo.
- [ ] Retenção: o cron diário remove análises, currículos e PDFs com mais de `RETENTION_DAYS` (90).
