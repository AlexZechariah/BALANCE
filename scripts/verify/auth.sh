#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export APP_ENV="${APP_ENV:-local}"
export NODE_ENV="${NODE_ENV:-test}"
export OBJECT_STORAGE_PROVIDER="${OBJECT_STORAGE_PROVIDER:-filesystem}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-balance-test-auth-queue-proof-$$}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-balance-test-auth-document-extract-$$}"

pnpm --filter @balance/api exec vitest run --no-file-parallelism \
  test/auth-session.test.ts \
  test/auth-token-lifecycle.test.ts

echo "[auth] auth/session and account-token checks passed"
