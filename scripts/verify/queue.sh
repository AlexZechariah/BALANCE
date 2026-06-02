#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_COMPOSE_FILE="infra/compose/compose.local.yml"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  DEFAULT_COMPOSE_FILE="infra/compose/compose.ci-proof.yml"
fi
COMPOSE_FILE="${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}"
COMPOSE_PROJECT_NAME="${BALANCE_QUEUE_COMPOSE_PROJECT:-${QUEUE_PROOF_COMPOSE_PROJECT:-balance-queue}}"
PROOF_TOOLS_IMAGE="${BALANCE_API_PROOF_TOOLS_IMAGE:-balance-api-proof-tools}"

cd "$ROOT_DIR"

export APP_ENV="${APP_ENV:-local}"
export POSTGRES_USER="${QUEUE_PROOF_POSTGRES_USER:-balance}"
export POSTGRES_PASSWORD="${QUEUE_PROOF_POSTGRES_PASSWORD:-balance}"
export POSTGRES_DB="${QUEUE_PROOF_POSTGRES_DB:-balance}"
export DATABASE_URL="${QUEUE_PROOF_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public}"
export REDIS_URL="${QUEUE_PROOF_REDIS_URL:-redis://redis:6379}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-queue_proof}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-document_extract}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export STORAGE_FILESYSTEM_ROOT="${STORAGE_FILESYSTEM_ROOT:-/data/balance-storage}"
export OCR_PROVIDER="${OCR_PROVIDER:-paddleocr}"

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

build_api_tools() {
  docker build -f apps/api/Dockerfile --target build -t "$PROOF_TOOLS_IMAGE" "$ROOT_DIR"
}

run_api_tool() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    --network "${COMPOSE_PROJECT_NAME}_default" \
    -e APP_ENV="$APP_ENV" \
    -e DATABASE_URL="$DATABASE_URL" \
    -e REDIS_URL="$REDIS_URL" \
    -e SEED_CONSUMER_PASSWORD=replace-this-local-only \
    -e SEED_REVIEWER_PASSWORD=replace-this-local-only \
    -e SEED_ADMIN_PASSWORD=replace-this-local-only \
    "$PROOF_TOOLS_IMAGE" "$@"
}

dump_diagnostics() {
  printf '\n[queue] diagnostics: docker compose ps\n' >&2
  compose ps >&2 || true
  printf '\n[queue] diagnostics: docker compose logs (postgres, redis, api, worker)\n' >&2
  compose logs --no-color --tail 200 postgres redis api worker >&2 || true
}

stop_stack() {
  if [ "${QUEUE_PROOF_KEEP_STACK:-0}" != "1" ]; then
    compose stop api worker redis postgres >/dev/null 2>&1 || true
  fi
}
trap stop_stack EXIT

compose up -d --build postgres redis
build_api_tools
run_api_tool pnpm prisma:deploy
run_api_tool pnpm prisma:seed
compose up -d --build api worker

for attempt in $(seq 1 30); do
  if compose exec -T worker python3.13 -c "import sys, urllib.request; response = urllib.request.urlopen('http://localhost:8000/health', timeout=3); sys.exit(0 if 200 <= response.status < 400 else 1)" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    dump_diagnostics
    printf 'worker health did not become ready\n' >&2
    exit 1
  fi
  sleep 2
done

for attempt in $(seq 1 30); do
  if compose exec -T worker python3.13 -c "import sys, urllib.request; response = urllib.request.urlopen('http://localhost:8000/ready', timeout=3); sys.exit(0 if 200 <= response.status < 400 else 1)" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    dump_diagnostics
    printf 'worker dependency readiness did not become ready\n' >&2
    exit 1
  fi
  sleep 2
done

compose exec -T api node dist/proof/queue.js
