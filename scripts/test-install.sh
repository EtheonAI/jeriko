#!/bin/bash
set -e

# ── Jeriko Install Test Orchestrator ─────────────────────────────
# Builds Docker images and runs install tests.
#
# Usage:
#   bash scripts/test-install.sh           # run all tests
#   bash scripts/test-install.sh --linux   # Linux only

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

CYAN='\033[36m'
GREEN='\033[32m'
RED='\033[31m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

info() { echo -e "  ${CYAN}$1${RESET}"; }
ok()   { echo -e "  ${GREEN}[ok]${RESET} $1"; }
err()  { echo -e "  ${RED}[!!]${RESET} $1"; }

echo ""
echo -e "  ${BOLD}${CYAN}Jeriko Install Tests${RESET}"
echo -e "  ${DIM}Docker-based installation verification${RESET}"
echo ""

# ── Check Docker ────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install Docker to run install tests."
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  err "Docker daemon is not running. Start Docker and try again."
  exit 1
fi

ok "Docker is available"

# ── Linux Test ──────────────────────────────────────────────────────

run_linux_test() {
  echo ""
  info "Building Linux test image..."
  docker build -t Jeriko-test-linux "$SCRIPT_DIR/docker/test-linux/"
  ok "Image built: Jeriko-test-linux"

  info "Running Linux install test..."
  echo ""

  if docker run --rm -v "$PROJECT_DIR:/repo:ro" Jeriko-test-linux; then
    ok "Linux install test PASSED"
    return 0
  else
    err "Linux install test FAILED"
    return 1
  fi
}

# ── Run Tests ───────────────────────────────────────────────────────

FAILURES=0

case "${1:-all}" in
  --linux|all)
    run_linux_test || FAILURES=$((FAILURES + 1))
    ;;
  *)
    err "Unknown test: $1"
    exit 1
    ;;
esac

# ── Summary ─────────────────────────────────────────────────────────

echo ""
if [ "$FAILURES" -gt 0 ]; then
  err "$FAILURES test suite(s) failed"
  exit 1
else
  ok "All install tests passed"
fi
echo ""
