#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-}"
DATABASE_URL="${DATABASE_URL:-}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [ -z "$OUTPUT_DIR" ]; then
  printf '[backup] BACKUP_OUTPUT_DIR is required; choose an encrypted, access-controlled destination\n' >&2
  exit 2
fi
if [ -z "$DATABASE_URL" ]; then
  printf '[backup] DATABASE_URL is required\n' >&2
  exit 2
fi
if ! [[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  printf '[backup] BACKUP_RETENTION_DAYS must be a positive integer\n' >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  printf '[backup] pg_dump is required\n' >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_path="$OUTPUT_DIR/balance-postgres-$timestamp.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --file="$output_path"
printf '[backup] wrote PostgreSQL custom-format backup to %s\n' "$output_path"
printf '[backup] retention target: %s days; lifecycle deletion must be managed by the approved backup destination\n' "$RETENTION_DAYS"
