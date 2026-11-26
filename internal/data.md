# Data

| Where | What | Kept |
|---|---|---|
| D1 `equanime` | analyses, participants, reviewer results, evidence, events, model calls, uploads, documents attached in the chat (`migrations/`) | `RETENTION_DAYS` (90), daily cron `src/retention.ts`; each analysis shows its `expires_at` |
| D1 `equanime` (accounts, `0004_accounts.sql`) | `users` (email, name, PBKDF2 password), `sessions` (token hash), `codes` (HMAC, 10 min), `usage` (daily limits), `wallets` (credits), `ledger` (grant/charge/refund) | until the account is deleted (`DELETE /conta`: also its analyses, uploads, documents; the ledger stays) |
| D1 `equanime-agent-memory` | the web chat's conversations (Mastra Memory); 50 per person, oldest deleted | until deleted in the chat or pushed out by newer ones |
| R2 `equanime-evidence` | `analyses/<id>/curricula/*.json` snapshots, `analyses/<id>/relatorio.pdf`, `uploads/<id>` original XML/ZIP, `documents/<id>` documents attached in the chat | same window |
| Collector volume `jobs` | SQLite queue: name, Lattes URL, result | finished jobs deleted after a day |

Personal data: names and Lattes URLs given by the user, and the public CV content.
Each analysis, upload and document belongs to the caller that created it (`actor`: the account's email,
`rubry:<code>`/`openwebui:<email>` through the agent, or `service:openwebui` for every OpenWebUI user).
Analyses made before accounts (owned by the Access email) belong to whoever registers that email. Logs carry a 12-character hash of the actor.
The landing page's "Dados e limites" section states this; change it with the code.
