#!/usr/bin/env bash
# Harness entry point. Run every check that applies to the current repo state.
#
# Usage:
#   scripts/harness/check.sh           # run everything
#   scripts/harness/check.sh --quiet   # silence success output (still fails loud)
#
# Invoked from:
#   - developer CLI (`make check` once the Makefile exists, otherwise direct)
#   - .github/workflows/docs.yml
#   - .claude/settings.json Stop hook
#
# Add new check stages here. Keep each stage:
#   * fast (sub-second locally; this script runs on every PR + every agent Stop)
#   * deterministic (no network, no clocks)
#   * single-purpose (one failure mode per stage)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

QUIET=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
  esac
done

log() {
  if [[ "$QUIET" -eq 0 ]]; then
    echo "$@"
  fi
}

fail() {
  echo "❌ harness check failed: $1" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Stage 1 — doc invariants
# ---------------------------------------------------------------------------

if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 not on PATH (required by scripts/harness/lint_docs.py)"
fi

log "→ lint_docs.py"
python3 scripts/harness/lint_docs.py || fail "lint_docs.py"

# ---------------------------------------------------------------------------
# Stage 2 — Go (active only when code exists, i.e. once M00 lands)
# ---------------------------------------------------------------------------

if [[ -f go.mod ]]; then
  log "→ go vet ./..."
  go vet ./... || fail "go vet"
  log "→ go test ./..."
  go test ./... || fail "go test"
fi

# ---------------------------------------------------------------------------
# Stage 3 — Frontend (active only when web/ exists)
# ---------------------------------------------------------------------------

if [[ -f web/package.json ]]; then
  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm not on PATH but web/ exists"
  fi
  log "→ pnpm --filter web typecheck"
  pnpm --filter web typecheck 2>/dev/null || fail "pnpm typecheck"
  log "→ pnpm --filter web test --run"
  pnpm --filter web test --run 2>/dev/null || fail "pnpm test"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "✅ harness check passed."
