#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_COMPOSE_FILE="infra/compose/compose.local.yml"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  DEFAULT_COMPOSE_FILE="infra/compose/compose.ci-proof.yml"
fi
COMPOSE_FILE="${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}"
COMPOSE_PROJECT_NAME="${QUEUE_PROOF_COMPOSE_PROJECT:-balance-queue-proof}"

cd "$ROOT_DIR"

export APP_ENV="${APP_ENV:-local}"
export POSTGRES_USER="${QUEUE_PROOF_POSTGRES_USER:-balance}"
export POSTGRES_PASSWORD="${QUEUE_PROOF_POSTGRES_PASSWORD:-balance}"
export POSTGRES_DB="${QUEUE_PROOF_POSTGRES_DB:-balance}"
export DATABASE_URL="${QUEUE_PROOF_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public}"
export REDIS_URL="${QUEUE_PROOF_REDIS_URL:-redis://redis:6379}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-queue_proof}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-document_extract}"
export JWT_SECRET="${JWT_SECRET:-replace-this-local-only}"
export PASSWORD_PEPPER="${PASSWORD_PEPPER:-replace-this-local-only}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export STORAGE_FILESYSTEM_ROOT="${STORAGE_FILESYSTEM_ROOT:-/data/balance-storage}"
export OCR_PROVIDER="${OCR_PROVIDER:-paddleocr}"

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

dump_diagnostics() {
  printf '\n[queue-proof] diagnostics: docker compose ps\n' >&2
  compose ps >&2 || true
  printf '\n[queue-proof] diagnostics: docker compose logs (postgres, redis, api, worker)\n' >&2
  compose logs --no-color --tail 200 postgres redis api worker >&2 || true
}

cleanup() {
  if [ "${QUEUE_PROOF_KEEP_STACK:-0}" != "1" ]; then
    compose down --remove-orphans -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

compose up -d --build postgres redis
compose run --rm --build api pnpm prisma:deploy
compose run --rm api pnpm prisma:seed
compose up -d --build api worker

for attempt in $(seq 1 30); do
  if compose exec -T worker curl -fsS http://localhost:8000/health >/dev/null; then
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
  if compose exec -T worker curl -fsS http://localhost:8000/ready >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    dump_diagnostics
    printf 'worker dependency readiness did not become ready\n' >&2
    exit 1
  fi
  sleep 2
done

compose exec -T api node apps/api/dist/queue-proof/produce-proof-job.js
