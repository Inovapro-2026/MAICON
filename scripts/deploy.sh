#!/usr/bin/env bash
# Deploy do SAVYRON (produção)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> 1. Instalando dependências"
npm install --omit=dev

echo "==> 1.1. Symlink do .env para o dashboard (Next.js carrega do seu diretório)"
ln -sf "$ROOT/.env" "$ROOT/apps/dashboard/.env"

echo "==> 2. Gerando Prisma client"
npm run db:generate

echo "==> 3. Aplicando migrações"
npm run db:migrate

echo "==> 4. Seed do admin (idempotente)"
(cd packages/database && npx ts-node -P tsconfig.json src/seed.ts)

echo "==> 5. Build (pacotes -> apps)"
npm run build

echo "==> 6. (Re)iniciando PM2"
pm2 start ecosystem.config.js --update-env
pm2 save

echo "==> 7. Verificação"
sleep 3
pm2 status

echo "==> Deploy concluído."
