# Data

| Where | What | Kept |
|---|---|---|
| D1 `equanime` | analyses, participants, reviewer results, evidence, events, model calls, uploads (`migrations/`) | `RETENTION_DAYS` (90), daily cron `src/retention.ts` |
| D1 `equanime-agent-memory` | the web chat's conversations (Mastra Memory); 50 per person, oldest deleted | until deleted in the chat or pushed out by newer ones |
| R2 `equanime-evidence` | `analyses/<id>/curricula/*.json` snapshots, `analyses/<id>/relatorio.pdf`, `uploads/<id>` original XML/ZIP | same window |
| Collector volume `jobs` | SQLite queue: name, Lattes URL, result | finished jobs deleted after a day |

Personal data: names and Lattes URLs given by the user, and the public CV content.
Each analysis and upload belongs to the caller that created it (`actor`: Access email, or
`service:openwebui` for every OpenWebUI user). Logs carry a 12-character hash of the actor.
The landing page's "Dados e limites" section states this; change it with the code.
