#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Typecheck de pacotes e serviços..."
for dir in $(find "$ROOT/packages" "$ROOT/services" -maxdepth 1 -mindepth 1 -type d); do
  if [ -f "$dir/tsconfig.json" ]; then
    echo "  -> $(basename "$dir")"
    (cd "$dir" && npx tsc --noEmit -p tsconfig.json)
  fi
done

echo "==> Typecheck OK."
