# Modera Bot

Moderação de links em grupos de WhatsApp, com login por cliente. Plano e contexto em [PLANO.md](PLANO.md).

## Rodar no computador

```bash
npm install
npm run db:dev          # Postgres local na porta 5433 (deixe aberto)
npx prisma migrate dev  # em outro terminal
npm run admin:create -- voce@email.com 'uma-senha-forte' "Seu Nome"   # admin não vira cliente
npm run dev
```

## Produção (VPS)

- App em `/opt/modera-bot`, PM2 na porta 3020 (`ecosystem.config.cjs`).
- Publicado em `modera.designcreator.cloud` pela stack `deploy/modera.yaml` (Traefik → nginx → 3020).
- Atualizar: `bash scripts/deploy.sh`.
- Importar a moderação do gerador: `npm run import:gerador -- <email> /opt/gerador-reels/data/prod.db`.
