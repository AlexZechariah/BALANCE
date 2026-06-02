#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export APP_ENV="${APP_ENV:-local}"
export NODE_ENV="${NODE_ENV:-test}"
export OBJECT_STORAGE_PROVIDER="${OBJECT_STORAGE_PROVIDER:-filesystem}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-balance-test-authz-queue-proof-$$}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-balance-test-authz-document-extract-$$}"

pnpm exec node scripts/verify/route-inventory.mjs

pnpm --filter @balance/api exec vitest run --no-file-parallelism --testTimeout 30000 --hookTimeout 30000 \
  test/authorization-policy.test.ts \
  test/authorization-forbidden.test.ts \
  test/prisma-security.test.ts \
  test/validation-security.test.ts \
  test/rate-limit-security.test.ts \
  test/queue-abuse.test.ts \
  test/security-boundary.test.ts \
  test/logging-redaction.test.ts \
  test/security-audit.test.ts

echo "[authz] authorization, scoped data access, rate-limit, and boundary checks passed"
