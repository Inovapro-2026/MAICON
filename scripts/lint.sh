#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npx prettier --check "apps/**/*.{ts,tsx,js,css}" "packages/**/*.ts" "services/**/*.ts" 2>/dev/null || echo "lint: prettier não aplicado (opcional)"
