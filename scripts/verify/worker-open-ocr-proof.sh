#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION
unset S3_BUCKET S3_REGION TEXTRACT_ROLE_ARN TEXTRACT_SNS_TOPIC_ARN

FIXTURE_PATH="${WORKER_OCR_PROOF_FIXTURE:-scripts/verify/fixtures/proof-receipt.jpg}"
if [ ! -f "$FIXTURE_PATH" ]; then
  printf '[worker-open-ocr-proof] missing fixture: %s\n' "$FIXTURE_PATH" >&2
  exit 2
fi

FIXTURE_DIR="$(cd "$(dirname "$FIXTURE_PATH")" && pwd)"
FIXTURE_NAME="$(basename "$FIXTURE_PATH")"
DOCKER_FIXTURE_PATH="$FIXTURE_PATH"
if command -v cygpath >/dev/null 2>&1; then
  DOCKER_FIXTURE_PATH="$(cygpath -m "$FIXTURE_PATH")"
fi
IMAGE_NAME="${BALANCE_WORKER_PROOF_IMAGE:-balance-worker-proof}"
CONTAINER_PREFIX="${BALANCE_WORKER_PROOF_CONTAINER_PREFIX:-balance-ocr-proof-$$}"

docker build -f services/worker/Dockerfile -t "$IMAGE_NAME" "$ROOT_DIR"

run_provider() {
  local provider="$1"
  local container_name="${CONTAINER_PREFIX}-${provider}"
  MSYS_NO_PATHCONV=1 docker run \
    -d \
    --name "$container_name" \
    -e APP_ENV=local \
    -e OBJECT_STORAGE_PROVIDER=filesystem \
    -e STORAGE_DRIVER=filesystem \
    -e OCR_ENABLE_TESSERACT_FALLBACK=false \
    -e EXTRACTION_ALLOW_LEGACY_TEXTRACT=false \
    "$IMAGE_NAME" \
    sleep 3600 >/dev/null

  local status=0
  MSYS_NO_PATHCONV=1 docker cp "$DOCKER_FIXTURE_PATH" "$container_name:/tmp/$FIXTURE_NAME" || status=$?
  if [ "$status" -eq 0 ]; then
    set +e
    MSYS_NO_PATHCONV=1 docker exec -i "$container_name" python - "$provider" "/tmp/$FIXTURE_NAME" <<'PY'
import json
import shutil
import sys
from pathlib import Path

provider = sys.argv[1]
source = Path(sys.argv[2])
local = source

from app.pipeline.image_preprocessor import preprocess_image
from app.pipeline.ocr_provider import run_ocr
from app.pipeline.parser import parse_fields
from app.pipeline.validator import validate_fields
from app.pipeline.confidence import score_confidence

preprocessed = preprocess_image(str(local))
ocr = run_ocr(provider, [preprocessed])
if ocr.provider != provider:
    raise AssertionError(f"requested {provider}, got {ocr.provider}")
if not ocr.text.strip():
    raise AssertionError(f"{provider} returned empty OCR text")

fields = parse_fields(ocr.text, ocr.confidence)
warnings = validate_fields(fields, ocr.confidence, ocr.warnings)
confidence = score_confidence(fields, warnings, ocr.confidence)
field_names = [field.name for field in fields]
if provider == "paddleocr" and not field_names:
    raise AssertionError("paddleocr produced no parsed field candidates")
if provider == "tesseract" and not ocr.text.strip():
    raise AssertionError("tesseract produced no OCR text")

print(json.dumps({
    "provider": provider,
    "textLength": len(ocr.text),
    "fieldNames": field_names,
    "warnings": warnings,
    "confidence": confidence,
}, sort_keys=True))
PY
    status=$?
    set -e
  fi
  docker stop "$container_name" >/dev/null || true
  return "$status"
}

run_provider tesseract
run_provider paddleocr
