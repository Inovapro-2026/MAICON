#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ORDER=(
  "packages/config"
  "packages/utils"
  "packages/logger"
  "packages/types"
  "packages/database"
  "services/ai"
  "services/email"
  "services/leads"
  "services/prospector"
  "services/whatsapp"
)

echo "==> Construindo pacotes compartilhados..."
for dir in "${ORDER[@]}"; do
  echo "  -> ${dir}"
  (cd "$ROOT/$dir" && npm run build)
done

echo "==> Pacotes construídos com sucesso."
