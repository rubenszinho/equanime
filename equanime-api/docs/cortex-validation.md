# Validação em cortex.icmc.usp.br

A implantação de produção substitui os identificadores locais de D1, R2 e Workflow em `wrangler.jsonc` pelos recursos criados na conta institucional. O domínio público da API fica protegido por Cloudflare Access. O OpenWebUI usa um service token próprio; o cliente web encaminha o JWT do usuário por service binding.

## Preparação

1. Criar D1 `equanime-production`, R2 `equanime-evidence-production` e aplicar `migrations/`.
2. Publicar o coletor privado e gravar `COLLECTOR_URL` e `COLLECTOR_TOKEN` como variável e segredo do Worker.
3. Gravar `TEAM_DOMAIN`, `POLICY_AUD`, `ACCESS_CLIENT_ID` e o segredo `ACCESS_CLIENT_SECRET`.
4. Configurar o modelo interno, se usado, em `LLM_BASE_URL`, `LLM_MODEL` e `LLM_API_KEY`. As regras continuam sem o modelo.
5. Publicar `equanime-api` com `--env production` e `equanime-web-client` com o service binding `EQUANIME_API`.
6. Proteger o hostname da API e o cliente com Access. A política da API permite usuários institucionais e o service token do OpenWebUI.

## Aceite operacional

- `GET /health` e `GET /ready` respondem no ambiente.
- O OpenWebUI importa `https://<api>/openapi.json` com o service token.
- O assistente em `openwebui/analise-de-banca.md` conduz uma banca acadêmica e uma banca de concurso.
- A coleta registra data, status e falha parcial sem transformar falha em ausência de conflito.
- Coautoria, orientação dos últimos cinco anos e projeto conjunto aparecem com evidência e no PDF.
- Logs e traces correlacionam `analysis_id`, tempos, regras, modelo e erros.
- A retenção diária remove análises e objetos além de `RETENTION_DAYS`.

A entrega institucional só está completa depois desse ensaio com o orientador, incluindo acesso, configuração e validação no ambiente.
