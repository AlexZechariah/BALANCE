#!/usr/bin/env bash
# postgres.sh
#
# Pre-migration PostgreSQL database backup.
# Creates a compressed custom-format dump using pg_dump -Fc.
# Runs through docker compose exec to reach the Postgres container.
# Validates dump size (> 100 bytes) to catch empty or corrupt dumps.
# Exits non-zero if backup creation or validation fails.
#
# This script supports both staging and production environments.
# BACKUP_DIR and retention cleanup are scoped by APP_ENV to prevent cross-environment contamination.
#
# Required environment variables:
#   COMPOSE_FILE         Path to the Docker Compose file
#   APP_ENV              Deployment environment (staging or production)
#   POSTGRES_PASSWORD    Postgres password
#
# Optional environment variables (with defaults):
#   POSTGRES_USER        Postgres user (default: balance)
#   POSTGRES_DB          Postgres database name (default: balance)
#   BACKUP_DIR           Backup output directory (default: /opt/balance/backups/<APP_ENV>)
#   MIN_DUMP_SIZE        Minimum acceptable dump size in bytes (default: 100)

set -euo pipefail

# ── Required variables ──────────────────────────────────────────────────────────
: "${COMPOSE_FILE:?COMPOSE_FILE is required}"
: "${APP_ENV:?APP_ENV is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

# ── Environment allowlist ───────────────────────────────────────────────────────
# APP_ENV must be validated before BACKUP_DIR uses it (avoid set -u unbound-variable risk).
if [ "$APP_ENV" != "staging" ] && [ "$APP_ENV" != "production" ]; then
  printf '[backup] APP_ENV must be staging or production, got: %s\n' "$APP_ENV" >&2
  exit 1
fi

# ── Configurable defaults ───────────────────────────────────────────────────────
POSTGRES_USER="${POSTGRES_USER:-balance}"
POSTGRES_DB="${POSTGRES_DB:-balance}"
BACKUP_DIR="${BACKUP_DIR:-/opt/balance/backups/${APP_ENV}}"
MIN_DUMP_SIZE="${MIN_DUMP_SIZE:-100}"

# ── Timestamped filename ────────────────────────────────────────────────────────
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILENAME="postgres-${APP_ENV}-${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
BACKUP_PATTERN="postgres-${APP_ENV}-*.dump"

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

  # ── Retention cleanup ─────────────────────────────────────────
  BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-5}"

  if ! [[ "$BACKUP_RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]]; then
    printf '[backup] BACKUP_RETENTION_COUNT must be a positive integer, got: %s\n' "$BACKUP_RETENTION_COUNT" >&2
    exit 1
  fi

  printf '[backup] Retention policy: keep latest %s %s backup(s)\n' "$BACKUP_RETENTION_COUNT" "$APP_ENV"

  mapfile -t backup_names < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "$BACKUP_PATTERN" -printf '%f\n' | sort -r
  )

  removed=0
  index=0
  for backup_name in "${backup_names[@]}"; do
    index=$((index + 1))
    if [ "$index" -le "$BACKUP_RETENTION_COUNT" ]; then
      continue
    fi
    rm -f -- "$BACKUP_DIR/$backup_name"
    removed=$((removed + 1))
  done

  if [ "$removed" -eq 0 ]; then
    printf '[backup] Retention: kept latest %s %s backup(s); no old backups removed\n' "$BACKUP_RETENTION_COUNT" "$APP_ENV"
  else
    printf '[backup] Retention: kept latest %s %s backup(s); removed %s old backup(s)\n' "$BACKUP_RETENTION_COUNT" "$APP_ENV" "$removed"
  fi
else
  printf 'Backup file was not created: %s\n' "$BACKUP_PATH" >&2
  exit 1
fi
