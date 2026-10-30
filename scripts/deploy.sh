#!/usr/bin/env bash
# Deploy na VPS. Rode dentro de /opt/modera-bot: bash scripts/deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERRO: crie o arquivo .env a partir de .env.example"
  exit 1
fi

echo "==> Baixando código"
git pull --ff-only

echo "==> Instalando dependências (pode levar alguns minutos, não interrompa)"
npm ci

echo "==> Migrando banco"
npx prisma migrate deploy

echo "==> Build"
npm run build

echo "==> PM2"
if pm2 describe modera-bot >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "==> Pronto: Modera Bot rodando na porta 3020"
