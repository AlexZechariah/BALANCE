#!/usr/bin/env bash
set -euo pipefail

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    printf '%s is required\n' "$name" >&2
    exit 1
  fi
}

reject_placeholder() {
  local name="$1"
  local value="${!name:-}"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    ''|'replace-this-local-only'|'change-me'|'change-me-local-only'|'change-me-for-local-only'|'balance'|'password')
      printf '%s must be a non-placeholder value\n' "$name" >&2
      exit 1
      ;;
  esac
}

APP_DIR="${APP_DIR:-/opt/balance}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
APP_ENV="${APP_ENV:-}"
GIT_COMMIT="${GIT_COMMIT:-}"
BUILD_ID="${BUILD_ID:-}"
DEPLOY_TOOLS_DIR="${DEPLOY_TOOLS_DIR:-$APP_DIR}"
SKIP_DB_MIGRATIONS="${SKIP_DB_MIGRATIONS:-false}"

require_var APP_DIR
require_var COMPOSE_FILE
require_var APP_ENV
require_var GIT_COMMIT
require_var BUILD_ID
require_var GRAFANA_ADMIN_PASSWORD
require_var JWT_SECRET
require_var PASSWORD_PEPPER

if [ "$APP_ENV" = 'staging' ] || [ "$APP_ENV" = 'production' ]; then
  require_var DATABASE_URL
  require_var POSTGRES_PASSWORD
  require_var SEED_CONSUMER_PASSWORD
  require_var SEED_REVIEWER_PASSWORD
  require_var SEED_ADMIN_PASSWORD
  require_var S3_BUCKET
  require_var AWS_REGION

  if [ -n "${S3_REGION:-}" ] && [ "$S3_REGION" != "$AWS_REGION" ]; then
    printf 'S3_REGION must match AWS_REGION in %s (S3_REGION=%s AWS_REGION=%s)\n' "$APP_ENV" "$S3_REGION" "$AWS_REGION" >&2
    exit 1
  fi

  if [ -n "${STORAGE_DRIVER:-}" ] && [ "$STORAGE_DRIVER" != 's3' ]; then
    printf 'STORAGE_DRIVER must be s3 in %s (got %s)\n' "$APP_ENV" "$STORAGE_DRIVER" >&2
    exit 1
  fi

  case "$DATABASE_URL" in
    *'balance:balance@'*)
      printf 'DATABASE_URL must not use the local balance:balance placeholder in %s\n' "$APP_ENV" >&2
      exit 1
      ;;
  esac

  reject_placeholder POSTGRES_PASSWORD
  reject_placeholder JWT_SECRET
  reject_placeholder PASSWORD_PEPPER
  reject_placeholder GRAFANA_ADMIN_PASSWORD
  reject_placeholder SEED_CONSUMER_PASSWORD
  reject_placeholder SEED_REVIEWER_PASSWORD
  reject_placeholder SEED_ADMIN_PASSWORD
fi

current_user="$(id -un)"

if [ "$current_user" = 'ubuntu' ] && [ "${HOME:-}" != '/home/ubuntu' ]; then
  export HOME='/home/ubuntu'
elif [ -z "${HOME:-}" ] && [ -d '/home/ubuntu' ]; then
  export HOME='/home/ubuntu'
fi

if ! [ -d "$APP_DIR" ]; then
  printf 'APP_DIR does not exist: %s\n' "$APP_DIR" >&2
  exit 1
fi

if ! [ -w "$APP_DIR" ]; then
  printf 'APP_DIR is not writable by %s\n' "$current_user" >&2
  exit 1
fi

cd "$APP_DIR"

if [ ! -d .git ]; then
  printf 'Git repository is missing in %s\n' "$APP_DIR" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  printf 'COMPOSE_FILE does not exist: %s\n' "$COMPOSE_FILE" >&2
  exit 1
fi

short_commit="$(printf '%s' "$GIT_COMMIT" | cut -c1-12)"
current_head_full="$(git rev-parse HEAD)"
current_head="$(printf '%s' "$current_head_full" | cut -c1-12)"

if [ "$current_head_full" != "$GIT_COMMIT" ]; then
  printf 'Repository HEAD %s does not match GIT_COMMIT %s\n' "$current_head_full" "$GIT_COMMIT" >&2
  exit 1
fi

printf 'whoami=%s\n' "$(whoami)"
id
pwd
printf 'HOME=%s\n' "${HOME:-}"
git --version
docker --version
docker compose version
printf 'APP_DIR=%s\n' "$APP_DIR"
printf 'COMPOSE_FILE=%s\n' "$COMPOSE_FILE"
printf 'APP_ENV=%s\n' "$APP_ENV"
printf 'GIT_COMMIT=%s\n' "$short_commit"
printf 'CURRENT_HEAD=%s\n' "$current_head"
printf 'BUILD_ID=%s\n' "$BUILD_ID"

export APP_NAME="${APP_NAME:-Balance}"
export PRODUCT_NAME="${PRODUCT_NAME:-Balance}"
export PROJECT_SLUG="${PROJECT_SLUG:-balance}"
export DEPLOYMENT_NAMESPACE="${DEPLOYMENT_NAMESPACE:-balance}"
export APP_ENV
export NODE_ENV="${NODE_ENV:-production}"
export APP_VERSION="${APP_VERSION:-0.5.0}"
export GIT_COMMIT
export BUILD_ID
export GH_PAT
export WEB_PORT="${WEB_PORT:-3000}"
export API_PORT="${API_PORT:-3001}"
export PUBLIC_HTTP_PORT="${PUBLIC_HTTP_PORT:-80}"
export API_BASE_URL="${API_BASE_URL:-http://api:3001}"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://api:3001}"
export API_BASE_PATH="${API_BASE_PATH:-/api}"
export API_HEALTH_PATH="${API_HEALTH_PATH:-/api/health}"
export API_VERSION_PATH="${API_VERSION_PATH:-/api/version}"
export NEXT_PUBLIC_API_BASE_PATH="${NEXT_PUBLIC_API_BASE_PATH:-$API_BASE_PATH}"
export NEXT_PUBLIC_API_HEALTH_PATH="${NEXT_PUBLIC_API_HEALTH_PATH:-$API_HEALTH_PATH}"
export NEXT_PUBLIC_API_VERSION_PATH="${NEXT_PUBLIC_API_VERSION_PATH:-$API_VERSION_PATH}"
export GRAFANA_ADMIN_PASSWORD

# Backend runtime variables (propagated from GitHub Actions / EC2 environment).
case "$APP_ENV" in
  staging|production)
    ;;
  *)
    printf 'Unsupported APP_ENV for AWS deployment: %s\n' "$APP_ENV" >&2
    exit 1
    ;;
esac

export DATABASE_URL
export POSTGRES_USER="${POSTGRES_USER:-balance}"
export POSTGRES_PASSWORD
export POSTGRES_DB="${POSTGRES_DB:-balance}"
export REDIS_URL="${REDIS_URL:-redis://redis:6379}"
export EXTRACTION_QUEUE_NAME="${EXTRACTION_QUEUE_NAME:-document_extract}"
export QUEUE_PROOF_NAME="${QUEUE_PROOF_NAME:-queue_proof}"

export STORAGE_DRIVER="${STORAGE_DRIVER:-s3}"
if [ "$APP_ENV" = 'staging' ] || [ "$APP_ENV" = 'production' ]; then
  if [ "$STORAGE_DRIVER" != 's3' ]; then
    printf 'STORAGE_DRIVER must be s3 in %s (got %s)\n' "$APP_ENV" "$STORAGE_DRIVER" >&2
    exit 1
  fi
  export STORAGE_DRIVER='s3'
fi
export S3_BUCKET="${S3_BUCKET:-}"
export AWS_REGION="${AWS_REGION:-}"
export S3_REGION="${S3_REGION:-$AWS_REGION}"
if [ "$APP_ENV" = 'staging' ] || [ "$APP_ENV" = 'production' ]; then
  require_var AWS_REGION
  require_var S3_REGION
  if [ "$S3_REGION" != "$AWS_REGION" ]; then
    printf 'S3_REGION must match AWS_REGION in %s (S3_REGION=%s AWS_REGION=%s)\n' "$APP_ENV" "$S3_REGION" "$AWS_REGION" >&2
    exit 1
  fi
fi

export JWT_SECRET
export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-1h}"
export PASSWORD_PEPPER
export SEED_CONSUMER_PASSWORD="${SEED_CONSUMER_PASSWORD:-replace-this-local-only}"
export SEED_REVIEWER_PASSWORD="${SEED_REVIEWER_PASSWORD:-replace-this-local-only}"
export SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-replace-this-local-only}"

export OCR_PROVIDER="${OCR_PROVIDER:-paddleocr}"
export EXTRACTION_PROVIDER_DEFAULT="${EXTRACTION_PROVIDER_DEFAULT:-$OCR_PROVIDER}"
export EXTRACTION_ALLOW_LEGACY_TEXTRACT="${EXTRACTION_ALLOW_LEGACY_TEXTRACT:-false}"

docker compose -f "$COMPOSE_FILE" down --remove-orphans
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

if [ "${SKIP_DB_MIGRATIONS}" = "true" ]; then
  printf 'SKIP_DB_MIGRATIONS=true — skipping database backup and Prisma migrations for rollback deployment\n'
else
  if [ "$APP_ENV" = 'staging' ] || [ "$APP_ENV" = 'production' ]; then
    printf 'Creating database backup before migration...\n'
    bash "$DEPLOY_TOOLS_DIR/scripts/backup/postgres.sh"
  fi

  if [ "$APP_ENV" = 'staging' ] || [ "$APP_ENV" = 'production' ]; then
    printf 'Applying Prisma migrations (prisma migrate deploy)...\n'
    attempts=0
    until docker compose -f "$COMPOSE_FILE" exec -T api pnpm prisma:deploy; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 10 ]; then
        printf 'Prisma migrate deploy failed after %s attempts\n' "$attempts" >&2
        exit 1
      fi
      printf 'Prisma migrate deploy failed; retrying (%s/10)...\n' "$attempts" >&2
      sleep 3
    done

    printf 'Applying Prisma seed (idempotent)...\n'
    attempts=0
    until docker compose -f "$COMPOSE_FILE" exec -T api pnpm prisma:seed; do
      attempts=$((attempts + 1))
      if [ "$attempts" -ge 10 ]; then
        printf 'Prisma seed failed after %s attempts\n' "$attempts" >&2
        exit 1
      fi
      printf 'Prisma seed failed; retrying (%s/10)...\n' "$attempts" >&2
      sleep 3
    done
  fi
fi

docker compose -f "$COMPOSE_FILE" ps
