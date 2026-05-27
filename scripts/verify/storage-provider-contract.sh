#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION
unset S3_BUCKET S3_REGION TEXTRACT_ROLE_ARN TEXTRACT_SNS_TOPIC_ARN

export APP_ENV="${APP_ENV:-local}"
export OBJECT_STORAGE_PROVIDER="${OBJECT_STORAGE_PROVIDER:-filesystem}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export EXTRACTION_PROVIDER_DEFAULT="${EXTRACTION_PROVIDER_DEFAULT:-paddleocr}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"

pnpm --filter @balance/api exec vitest run \
  test/storage-provider.contract.test.ts \
  test/extraction.validation.test.ts
