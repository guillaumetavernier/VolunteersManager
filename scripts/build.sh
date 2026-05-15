#!/usr/bin/env bash
# Build the single static binary with the frontend embedded.
#
# Usage: scripts/build.sh [output-path]
#   output-path: defaults to ./dist/volunteers

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT="${1:-./dist/volunteers}"
mkdir -p "$(dirname "$OUT")"

echo "→ pnpm --filter ./web install"
pnpm --filter ./web install --frozen-lockfile

echo "→ pnpm --filter ./web build"
pnpm --filter ./web build

echo "→ go build -o $OUT ./cmd/volunteers"
go build -trimpath -ldflags="-s -w" -o "$OUT" ./cmd/volunteers

echo "✅ built $OUT"
