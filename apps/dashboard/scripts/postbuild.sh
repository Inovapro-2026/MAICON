#!/usr/bin/env bash
# Deploy standalone (output: 'standalone') exige copiar static/ e public/
# para dentro do standalone — sem isso o servidor 404 em chunks e assets.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_ROOT="$DIR/.next/standalone"
STANDALONE_APP="$DIR/.next/standalone/apps/dashboard"

rm -rf "$STANDALONE_APP/.next/static" "$STANDALONE_APP/public"
rm -rf "$STANDALONE_ROOT/.next/static" "$STANDALONE_ROOT/public"

mkdir -p "$STANDALONE_APP/.next" "$STANDALONE_ROOT/.next"

cp -r "$DIR/.next/static" "$STANDALONE_APP/.next/static"
cp -r "$DIR/public" "$STANDALONE_APP/public"

cp -r "$DIR/.next/static" "$STANDALONE_ROOT/.next/static"
cp -r "$DIR/public" "$STANDALONE_ROOT/public"

echo "==> postbuild: static/ e public/ copiados para standalone_app e standalone_root."

