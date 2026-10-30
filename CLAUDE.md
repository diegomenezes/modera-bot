@AGENTS.md
@PLANO.md

## Projeto

- Textos da interface e mensagens de commit em português, frases curtas e diretas.
- Todo acesso a dados de cliente passa por `src/lib/dal.ts` (`requireWorkspace()` / `requireAdmin()`).
  Nunca consultar tabelas de moderação sem `workspaceId`.
- Banco local: `npm run db:dev` sobe um Postgres embutido na porta 5433 (pasta `.pgdata`).
- Primeiro admin: `npm run admin:create -- <email> <senha> "<nome>"`.
