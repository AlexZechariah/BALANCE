#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_COMPOSE_FILE="infra/compose/compose.local.yml"
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  DEFAULT_COMPOSE_FILE="infra/compose/compose.ci-proof.yml"
fi
COMPOSE_FILE="${COMPOSE_FILE:-$DEFAULT_COMPOSE_FILE}"
COMPOSE_PROJECT_NAME="${BALANCE_EXTRACTION_COMPOSE_PROJECT:-${WORKER_EXTRACTION_PROOF_COMPOSE_PROJECT:-balance-extraction}}"
PROOF_TOOLS_IMAGE="${BALANCE_API_PROOF_TOOLS_IMAGE:-balance-api-proof-tools}"

cd "$ROOT_DIR"

export APP_ENV="${APP_ENV:-local}"
export POSTGRES_USER="${WORKER_EXTRACTION_PROOF_POSTGRES_USER:-balance}"
export POSTGRES_PASSWORD="${WORKER_EXTRACTION_PROOF_POSTGRES_PASSWORD:-balance}"
export POSTGRES_DB="${WORKER_EXTRACTION_PROOF_POSTGRES_DB:-balance}"
export DATABASE_URL="${WORKER_EXTRACTION_PROOF_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public}"
export REDIS_URL="${WORKER_EXTRACTION_PROOF_REDIS_URL:-redis://redis:6379}"
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
  printf '\n[extraction] diagnostics: docker compose ps\n' >&2
  compose ps >&2 || true
  printf '\n[extraction] diagnostics: docker compose logs (postgres, redis, api, worker)\n' >&2
  compose logs --no-color --tail 200 postgres redis api worker >&2 || true
}

stop_stack() {
  if [ "${WORKER_EXTRACTION_PROOF_KEEP_STACK:-0}" != "1" ]; then
    compose stop api worker redis postgres >/dev/null 2>&1 || true
  fi
}
trap stop_stack EXIT

if [ "${WORKER_EXTRACTION_PROOF_KEEP_STACK:-0}" != "1" ]; then
  compose stop api worker redis postgres >/dev/null 2>&1 || true
fi

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

for attempt in $(seq 1 30); do
  if compose exec -T worker python3.13 -c "import sys, urllib.request; response = urllib.request.urlopen('http://api:3001/ready', timeout=3); sys.exit(0 if 200 <= response.status < 400 else 1)" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    dump_diagnostics
    printf 'api readiness did not become ready\n' >&2
    exit 1
  fi
  sleep 2
done

FIXTURE_PATH="scripts/verify/fixtures/proof-receipt.jpg"
if [ ! -f "$FIXTURE_PATH" ]; then
  printf 'Missing proof receipt fixture at %s\n' "$FIXTURE_PATH" >&2
  exit 1
fi

FIXTURE_CONTAINER_PATH="/tmp/proof-receipt.jpg"
if ! compose exec -T api sh -c "cat > '$FIXTURE_CONTAINER_PATH'" < "$FIXTURE_PATH"; then
  dump_diagnostics
  printf 'Failed to copy proof receipt fixture into api container at %s\n' "$FIXTURE_CONTAINER_PATH" >&2
  exit 1
fi

if ! compose exec -T api sh -c "test -s '$FIXTURE_CONTAINER_PATH'"; then
  dump_diagnostics
  printf 'Proof receipt fixture in api container is missing or empty at %s\n' "$FIXTURE_CONTAINER_PATH" >&2
  exit 1
fi

if ! compose exec -T api node - <<'NODE'
import { readFileSync } from 'node:fs';
const apiBase = 'http://localhost:3001';
const requiredAuditActions = [
  'document.uploaded',
  'extraction.queued',
  'extraction.started',
  'extraction.completed'
];

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

function cookieHeaderFromResponse(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=\s*balance\.)/g).filter(Boolean);
  const cookies = setCookies
    .map((cookie) => cookie.split(';', 1)[0].trim())
    .filter(Boolean);
  if (!cookies.length) {
    throw new Error('login did not return session cookies');
  }
  return cookies.join('; ');
}

async function fetchJsonResponse(path, options = {}) {
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
  return { body, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const loginResult = await fetchJsonResponse('/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'consumer@balance.local',
    password: 'replace-this-local-only'
  })
});

const session = {
  cookieHeader: cookieHeaderFromResponse(loginResult.response),
  csrfToken: loginResult.body?.csrfToken
};
assert(typeof session.csrfToken === 'string' && session.csrfToken.length > 20, 'login did not return a CSRF token');

const imageBytes = readFileSync('/tmp/proof-receipt.jpg');
assert(imageBytes.length > 0, 'proof receipt fixture is empty');

const form = new FormData();
form.set('label', 'Worker extraction proof');
form.set('category', 'other');
form.set('notes', 'Deterministic OCR proof fixture');
form.set('file', new Blob([imageBytes], { type: 'image/jpeg' }), 'proof-receipt.jpg');

const upload = await fetchJson('/documents', {
  method: 'POST',
  headers: {
    cookie: session.cookieHeader,
    'x-csrf-token': session.csrfToken
  },
  body: form
});

const documentId = upload?.document?.id;
assert(documentId, 'upload did not return a document id');
assert(upload?.extractionJob?.status === 'queued', 'upload did not create a queued extraction job');

let detail = null;
for (let attempt = 1; attempt <= 45; attempt += 1) {
  detail = await fetchJson(`/documents/${documentId}`, {
    headers: { cookie: session.cookieHeader }
  });
  const status = detail?.document?.status;
  if (['extracted', 'correction_required', 'failed'].includes(status)) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

const document = detail?.document;
assert(document, 'document detail was not returned');
assert(document.status !== 'failed', `extraction failed: ${document.extractionJob?.errorMessage ?? 'unknown error'}`);
assert(['extracted', 'correction_required'].includes(document.status), `expected extracted or correction_required document status, got ${document.status}`);
assert(document.extractionJob?.status === 'completed', `expected completed extraction job, got ${document.extractionJob?.status}`);
assert(Array.isArray(document.fields) && document.fields.length > 0, 'expected at least one persisted document field');

const fieldNames = new Set(document.fields.map((field) => field.name));
assert(fieldNames.has('merchantName') || fieldNames.has('amountMinor'), 'expected merchantName or amountMinor OCR field');

const audit = await fetchJson(`/audit?documentId=${documentId}`, {
  headers: { cookie: session.cookieHeader }
});
const actions = new Set((audit?.auditEvents ?? []).map((event) => event.action));
for (const action of requiredAuditActions) {
  assert(actions.has(action), `missing audit action ${action}`);
}

console.log(
  JSON.stringify({
    ok: true,
    documentId,
    documentStatus: document.status,
    extractionJobStatus: document.extractionJob.status,
    fields: document.fields.map((field) => field.name),
    auditActions: requiredAuditActions
  })
);
NODE
then
  dump_diagnostics
  printf '\n[extraction] proof failed\n' >&2
  exit 1
fi
