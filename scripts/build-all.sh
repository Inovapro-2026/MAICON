#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/build-packages.sh"

echo "==> Construindo aplicações..."
for dir in apps/api apps/worker; do
  echo "  -> ${dir}"
  (cd "$ROOT/$dir" && npm run build)
done

echo "==> Build completo."
