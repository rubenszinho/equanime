# Equânime: internal notes

For maintainers and for a fresh Claude Code session. The code is the source of truth;
these notes say where things are and why.

| File | Read it for |
|---|---|
| [architecture.md](architecture.md) | The three parts, how an analysis flows, where CVs come from |
| [operations.md](operations.md) | Toolchain, local dev, deploys, secrets, checks |
| [data.md](data.md) | What is stored, where, and for how long |
| [conventions.md](conventions.md) | How the owner wants work done; open items |

The issue that defines the product: https://github.com/Labic-ICMC-USP/agents4gov/issues/14.
Equânime is its own product (Rubrion), not part of the Agents4GovApps library; the old
`lattes_collector.py` / `lattes_coi_judge.py` there were only a starting idea.
