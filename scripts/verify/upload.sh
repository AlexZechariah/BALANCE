#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION
unset S3_BUCKET S3_REGION TEXTRACT_ROLE_ARN TEXTRACT_SNS_TOPIC_ARN

export APP_ENV="${APP_ENV:-local}"
export NODE_ENV="${NODE_ENV:-test}"
export OBJECT_STORAGE_PROVIDER="${OBJECT_STORAGE_PROVIDER:-filesystem}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export EXTRACTION_PROVIDER_DEFAULT="${EXTRACTION_PROVIDER_DEFAULT:-paddleocr}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-balance-test-upload-queue-proof-$$}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-balance-test-upload-document-extract-$$}"

pnpm --filter @balance/api exec vitest run test/upload-security.test.ts

python_cmd=(python)
if ! command -v python >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    python_cmd=(python3)
  elif command -v python.exe >/dev/null 2>&1; then
    python_cmd=(python.exe)
  elif command -v py >/dev/null 2>&1; then
    python_cmd=(py -3)
  elif command -v py.exe >/dev/null 2>&1; then
    python_cmd=(py.exe -3)
  else
    printf '[upload] required Python runtime not found: tried python, python3, python.exe, py -3, py.exe -3\n' >&2
    exit 1
  fi
fi

worker_pythonpath="$ROOT_DIR/services/worker"
case "${python_cmd[0]}" in
  *.exe|py)
    if command -v cygpath >/dev/null 2>&1; then
      worker_pythonpath="$(cygpath -w "$worker_pythonpath")"
    elif command -v wslpath >/dev/null 2>&1; then
      worker_pythonpath="$(wslpath -w "$worker_pythonpath")"
    fi
    ;;
esac

PYTHONPATH="$worker_pythonpath" "${python_cmd[@]}" -m unittest \
  services.worker.tests.test_worker_logging \
  services.worker.tests.test_parser_validator

echo "[upload] upload validation and worker-safe logging checks passed"
