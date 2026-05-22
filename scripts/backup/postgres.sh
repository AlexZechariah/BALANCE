#!/usr/bin/env bash
# postgres.sh
#
# Pre-migration PostgreSQL database backup.
# Creates a compressed custom-format dump using pg_dump -Fc.
# Runs through docker compose exec to reach the Postgres container.
# Validates dump size (> 100 bytes) to catch empty or corrupt dumps.
# Exits non-zero if backup creation or validation fails.
#
# This script is staging-only in Phase 5. It refuses to run for any other
# environment to prevent accidental production backup under the staging path.
#
# Required environment variables:
#   COMPOSE_FILE         Path to the Docker Compose file
#   APP_ENV              Deployment environment (must be staging)
#   POSTGRES_PASSWORD    Postgres password
#
# Optional environment variables (with defaults):
#   POSTGRES_USER        Postgres user (default: balance)
#   POSTGRES_DB          Postgres database name (default: balance)
#   BACKUP_DIR           Backup output directory (default: /opt/swe40006-project/backups/staging)
#   MIN_DUMP_SIZE        Minimum acceptable dump size in bytes (default: 100)

set -euo pipefail

# ── Required variables ──────────────────────────────────────────────────────────
: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${APP_ENV:?APP_ENV is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

# ── Configurable defaults ───────────────────────────────────────────────────────
POSTGRES_USER="${POSTGRES_USER:-balance}"
POSTGRES_DB="${POSTGRES_DB:-balance}"
BACKUP_DIR="${BACKUP_DIR:-/opt/swe40006-project/backups/staging}"
MIN_DUMP_SIZE="${MIN_DUMP_SIZE:-100}"

# ── Staging-only guard ──────────────────────────────────────────────────────────
if [ "$APP_ENV" != "staging" ]; then
  printf 'Backup script is only enabled for staging in Phase 5. APP_ENV=%s\n' "$APP_ENV" >&2
  exit 1
fi

# ── Timestamped filename ────────────────────────────────────────────────────────
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILENAME="postgres-${APP_ENV}-${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# ── Create backup directory ─────────────────────────────────────────────────────
install -d -m 0755 "$BACKUP_DIR"

printf 'Creating database backup before migration...\n'
printf 'Creating database backup: %s\n' "$BACKUP_PATH"

# ── Run pg_dump via docker compose exec ─────────────────────────────────────────
# -T disables pseudo-TTY allocation (required for non-interactive SSM context).
# PGPASSWORD is passed as a container env var to avoid interactive password prompt.
docker compose -f "$COMPOSE_FILE" exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
  > "$BACKUP_PATH"

# ── Validate dump file size ────────────────────────────────────────────────────
if [ -f "$BACKUP_PATH" ]; then
  FILE_SIZE="$(stat -c %s "$BACKUP_PATH" 2>/dev/null)"
  if [ -z "$FILE_SIZE" ] || [ "$FILE_SIZE" -le "$MIN_DUMP_SIZE" ]; then
    printf 'Backup validation failed: dump file is too small (%s bytes)\n' "${FILE_SIZE:-0}" >&2
    rm -f "$BACKUP_PATH"
    exit 1
  fi
  printf 'Backup created successfully: %s (%s bytes)\n' "$BACKUP_PATH" "$FILE_SIZE"
else
  printf 'Backup file was not created: %s\n' "$BACKUP_PATH" >&2
  exit 1
fi
