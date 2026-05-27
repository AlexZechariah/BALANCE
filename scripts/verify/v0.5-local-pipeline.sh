#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_COMPOSE_FILE="infra/compose/compose.ci-proof.yml"
COMPOSE_FILE="${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}"
COMPOSE_PROJECT_NAME="${BALANCE_PROOF_COMPOSE_PROJECT:-balance-proof-$$}"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE AWS_REGION AWS_DEFAULT_REGION
unset S3_BUCKET S3_REGION TEXTRACT_ROLE_ARN TEXTRACT_SNS_TOPIC_ARN

export APP_ENV="${APP_ENV:-local}"
export POSTGRES_USER="${BALANCE_PROOF_POSTGRES_USER:-balance}"
export POSTGRES_PASSWORD="${BALANCE_PROOF_POSTGRES_PASSWORD:-balance}"
export POSTGRES_DB="${BALANCE_PROOF_POSTGRES_DB:-balance}"
export DATABASE_URL="${BALANCE_PROOF_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public}"
export REDIS_URL="${BALANCE_PROOF_REDIS_URL:-redis://redis:6379}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-queue_proof}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-document_extract}"
export JWT_SECRET="${JWT_SECRET:-replace-this-local-only}"
export PASSWORD_PEPPER="${PASSWORD_PEPPER:-replace-this-local-only}"
export OBJECT_STORAGE_PROVIDER="${OBJECT_STORAGE_PROVIDER:-filesystem}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export EXTRACTION_PROVIDER_DEFAULT="${EXTRACTION_PROVIDER_DEFAULT:-paddleocr}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"
export OCR_PROVIDER="${OCR_PROVIDER:-paddleocr}"
export OCR_ENABLE_TESSERACT_FALLBACK="${OCR_ENABLE_TESSERACT_FALLBACK:-true}"

compose() {
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

dump_diagnostics() {
  printf '\n[balance-local-proof] diagnostics: docker compose ps\n' >&2
  compose ps >&2 || true
  printf '\n[balance-local-proof] diagnostics: docker compose logs (postgres, redis, api, worker)\n' >&2
  compose logs --no-color --tail 200 postgres redis api worker >&2 || true
}

stop_stack() {
  if [ "${BALANCE_PROOF_KEEP_STACK:-0}" != "1" ]; then
    compose stop api worker redis postgres >/dev/null 2>&1 || true
  fi
}
trap stop_stack EXIT

wait_for_api() {
  for attempt in $(seq 1 60); do
    if compose exec -T api node --input-type=module -e "const r = await fetch('http://localhost:3001/ready'); if (!r.ok) process.exit(1);" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  dump_diagnostics
  printf '[balance-local-proof] api readiness did not become ready\n' >&2
  exit 1
}

wait_for_worker() {
  for attempt in $(seq 1 60); do
    if compose exec -T worker curl -fsS http://localhost:8000/ready >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  dump_diagnostics
  printf '[balance-local-proof] worker readiness did not become ready\n' >&2
  exit 1
}

assert_no_aws_env() {
  local service="$1"
  local env_output
  if env_output="$(compose exec -T "$service" sh -c 'env | grep -E "^(AWS_|AWS_DEFAULT_REGION|S3_BUCKET|S3_REGION|TEXTRACT_)"' 2>/dev/null)"; then
    printf '%s\n' "$env_output" >&2
    printf '[balance-local-proof] %s has active legacy cloud OCR env\n' "$service" >&2
    exit 1
  fi
}

FIXTURE_PATH="${BALANCE_PROOF_FIXTURE:-scripts/verify/fixtures/proof-receipt.jpg}"
if [ ! -f "$FIXTURE_PATH" ]; then
  printf '[balance-local-proof] missing fixture: %s\n' "$FIXTURE_PATH" >&2
  exit 2
fi

compose config >/dev/null
compose up -d --build postgres redis api

compose exec -T api pnpm prisma:deploy
compose exec -T \
  -e SEED_CONSUMER_PASSWORD=replace-this-local-only \
  -e SEED_REVIEWER_PASSWORD=replace-this-local-only \
  -e SEED_ADMIN_PASSWORD=replace-this-local-only \
  api pnpm prisma:seed

compose up -d --build worker

wait_for_api
wait_for_worker
assert_no_aws_env api
assert_no_aws_env worker

FIXTURE_CONTAINER_PATH="/tmp/balance-proof-receipt.jpg"
if ! compose exec -T api sh -c "cat > '$FIXTURE_CONTAINER_PATH'" < "$FIXTURE_PATH"; then
  dump_diagnostics
  printf '[balance-local-proof] failed to copy fixture into api container\n' >&2
  exit 1
fi

if ! compose exec -T api node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';

const apiBase = 'http://localhost:3001';
const fixturePath = '/tmp/balance-proof-receipt.jpg';
const requiredDocumentAuditActions = [
  'document.uploaded',
  'extraction.queued',
  'extraction.started',
  'extraction.completed',
  'document.corrected',
  'claim.submitted',
  'review.started',
  'review.approved'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const bodyText = await response.text();
  let body = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new Error(`${path} returned non-JSON response: ${bodyText.slice(0, 300)}`);
    }
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${bodyText.slice(0, 300)}`);
  }
  return body;
}

async function login(email) {
  const result = await fetchJson('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'replace-this-local-only' })
  });
  assert(result.accessToken, `login did not return a token for ${email}`);
  return { token: result.accessToken, user: result.user };
}

const consumer = await login('consumer@balance.local');
const reviewer = await login('reviewer@balance.local');
const admin = await login('admin@balance.local');

const imageBytes = readFileSync(fixturePath);
assert(imageBytes.length > 0, 'fixture is empty');

const form = new FormData();
form.set('label', 'Balance local proof');
form.set('category', 'other');
form.set('notes', 'Local no-AWS proof fixture');
form.set('file', new Blob([imageBytes], { type: 'image/jpeg' }), 'balance-proof-receipt.jpg');

const upload = await fetchJson('/documents', {
  method: 'POST',
  headers: { authorization: `Bearer ${consumer.token}` },
  body: form
});

const documentId = upload?.document?.id;
assert(documentId, 'upload did not return a document id');
assert(upload?.document?.status === 'queued', `expected queued upload status, got ${upload?.document?.status}`);
assert(upload?.extractionJob?.provider === 'paddleocr', `expected paddleocr extraction job, got ${upload?.extractionJob?.provider}`);

const preview = await fetch(`${apiBase}/documents/${documentId}/preview`, {
  headers: { authorization: `Bearer ${consumer.token}` }
});
assert(preview.ok, `preview returned ${preview.status}`);
const previewBytes = await preview.arrayBuffer();
assert(previewBytes.byteLength === imageBytes.length, 'preview bytes do not match uploaded fixture size');

let detail = null;
for (let attempt = 1; attempt <= 90; attempt += 1) {
  detail = await fetchJson(`/documents/${documentId}`, {
    headers: { authorization: `Bearer ${consumer.token}` }
  });
  const status = detail?.document?.status;
  if (['extracted', 'correction_required', 'failed'].includes(status)) break;
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

const extractedDocument = detail?.document;
assert(extractedDocument, 'document detail was not returned');
assert(extractedDocument.status !== 'failed', `extraction failed: ${extractedDocument.extractionJob?.errorMessage ?? 'unknown error'}`);
assert(['extracted', 'correction_required'].includes(extractedDocument.status), `expected extracted/correction_required status, got ${extractedDocument.status}`);
assert(extractedDocument.extractionJob?.status === 'completed', `expected completed extraction job, got ${extractedDocument.extractionJob?.status}`);
assert(extractedDocument.extractionJob?.provider === 'paddleocr', `expected provider paddleocr, got ${extractedDocument.extractionJob?.provider}`);
assert(Array.isArray(extractedDocument.fields) && extractedDocument.fields.length > 0, 'expected persisted extracted fields');
assert(typeof extractedDocument.extractionJob?.confidenceSummary === 'object', 'expected confidence summary');
assert(Array.isArray(extractedDocument.extractionJob?.warningCodes), 'expected warning code array');

const correctionField = extractedDocument.fields[0];
assert(correctionField?.id && correctionField?.name, 'expected a correction target field');
const correctionValue = correctionField.value || correctionField.correctedValue || 'Manual correction';
const correction = await fetchJson(`/documents/${documentId}/corrections`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${consumer.token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    fields: [{ id: correctionField.id, name: correctionField.name, correctedValue: correctionValue }]
  })
});
assert(correction.document.status === 'corrected', `expected corrected status, got ${correction.document.status}`);

const claim = await fetchJson('/claims', {
  method: 'POST',
  headers: { authorization: `Bearer ${consumer.token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ documentId, purpose: 'Balance local proof', note: 'No-AWS proof claim' })
});
assert(claim.claim.status === 'submitted', `expected submitted claim, got ${claim.claim.status}`);
assert(claim.review.status === 'pending', `expected pending review, got ${claim.review.status}`);

const reviewQueue = await fetchJson('/reviews/queue', {
  headers: { authorization: `Bearer ${reviewer.token}` }
});
assert(reviewQueue.reviews.some((review) => review.id === claim.review.id), 'review queue does not include proof review');

const reviewClaim = await fetchJson(`/reviews/${claim.review.id}/claim`, {
  method: 'POST',
  headers: { authorization: `Bearer ${reviewer.token}` }
});
assert(reviewClaim.review.status === 'in_review', `expected in_review, got ${reviewClaim.review.status}`);

const approval = await fetchJson(`/reviews/${claim.review.id}/approve`, {
  method: 'POST',
  headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ note: 'Approved by Balance proof script' })
});
assert(approval.review.status === 'approved', `expected approved review, got ${approval.review.status}`);
assert(approval.claim.status === 'approved', `expected approved claim, got ${approval.claim.status}`);
assert(approval.document.status === 'reviewed', `expected reviewed document, got ${approval.document.status}`);

const audit = await fetchJson(`/audit?documentId=${documentId}`, {
  headers: { authorization: `Bearer ${consumer.token}` }
});
const actions = new Set((audit.auditEvents ?? []).map((event) => event.action));
for (const action of requiredDocumentAuditActions) {
  assert(actions.has(action), `missing audit action ${action}`);
}

console.log(JSON.stringify({
  ok: true,
  documentId,
  extractionProvider: extractedDocument.extractionJob.provider,
  extractionStatus: extractedDocument.extractionJob.status,
  documentStatusAfterExtraction: extractedDocument.status,
  documentStatusAfterReview: approval.document.status,
  fieldNames: extractedDocument.fields.map((field) => field.name),
  warningCodes: extractedDocument.extractionJob.warningCodes,
  confidenceSummary: extractedDocument.extractionJob.confidenceSummary,
  auditActions: requiredDocumentAuditActions
}));
NODE
then
  dump_diagnostics
  printf '\n[balance-local-proof] proof failed\n' >&2
  exit 1
fi
