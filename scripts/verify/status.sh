#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BALANCE_VERIFY_LIVE="${BALANCE_VERIFY_LIVE:-1}"
GATUS_CONFIG="${GATUS_CONFIG:-infra/observability/gatus/config.yml}"
CADDYFILE="${CADDYFILE:-infra/observability/caddy/Caddyfile}"

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '[status] required command not found: %s\n' "$name" >&2
    exit 1
  fi
}

assert_file_contains() {
  local path="$1"
  local needle="$2"
  if ! grep -F "$needle" "$path" >/dev/null; then
    printf '[status] %s did not contain required text: %s\n' "$path" "$needle" >&2
    exit 1
  fi
}

assert_text_not_match() {
  local label="$1"
  local content="$2"
  local pattern="$3"
  if printf '%s' "$content" | grep -Eiq "$pattern"; then
    printf '[status] %s exposed prohibited internal detail matching /%s/\n' "$label" "$pattern" >&2
    exit 1
  fi
}

require_command grep

printf '[status] checking public-safe Gatus static config\n'
assert_file_contains "$GATUS_CONFIG" 'title: Balance Status'
assert_file_contains "$GATUS_CONFIG" 'header: Balance Status'
assert_file_contains "$GATUS_CONFIG" 'description: Public service status for Balance.'
assert_file_contains "$GATUS_CONFIG" 'type: sqlite'
assert_file_contains "$GATUS_CONFIG" 'metrics: true'
assert_file_contains "$GATUS_CONFIG" 'url: http://ntfy'

endpoint_count="$(grep -c '^  - name:' "$GATUS_CONFIG")"
for hidden_field in hide-url hide-hostname hide-port hide-conditions hide-errors; do
  field_count="$(grep -c "      ${hidden_field}: true" "$GATUS_CONFIG")"
  if [ "$field_count" -lt "$endpoint_count" ]; then
    printf '[status] expected %s on every endpoint, found %s for %s endpoints\n' "$hidden_field" "$field_count" "$endpoint_count" >&2
    exit 1
  fi
done

printf '[status] checking Caddy public status routing policy\n'
assert_file_contains "$CADDYFILE" 'status.{$BALANCE_BASE_DOMAIN:localhost.localdomain}'
assert_file_contains "$CADDYFILE" 'handle /metrics*'
assert_file_contains "$CADDYFILE" 'reverse_proxy gatus:8080'
assert_file_contains "$CADDYFILE" 'metrics.{$BALANCE_BASE_DOMAIN:localhost.localdomain}, logs.{$BALANCE_BASE_DOMAIN:localhost.localdomain}'

if [ "$BALANCE_VERIFY_LIVE" = "0" ]; then
  printf '[status] live status checks skipped because BALANCE_VERIFY_LIVE=0\n'
  exit 0
fi

require_command curl

printf '[status] checking live local Gatus public page\n'
page_html="$(curl --fail --show-error --silent --max-time 20 'http://127.0.0.1:8080/')"
config_json="$(curl --fail --show-error --silent --max-time 20 'http://127.0.0.1:8080/api/v1/config')"

if ! printf '%s' "$page_html" | grep -F 'Balance Status' >/dev/null; then
  printf '[status] live status page did not contain Balance Status\n' >&2
  exit 1
fi

for content_name in 'status page HTML' 'status config API'; do
  case "$content_name" in
    'status page HTML') content="$page_html" ;;
    *) content="$config_json" ;;
  esac

  assert_text_not_match "$content_name" "$content" 'api:3001|worker:8000|postgres:5432|redis:6379|grafana:3000|prometheus:9090|loki:3100|tempo:3200|pyroscope:4040|[0-9]+\.[0-9]+\.[0-9]+.*(prometheus|grafana|loki|tempo|pyroscope|gatus|caddy|authelia|ntfy)'
  assert_text_not_match "$content_name" "$content" 'request[_ -]?id|trace[_ -]?id|document[_ -]?id|claim[_ -]?id|review[_ -]?id|user[_ -]?id|storage[_ -]?key|ocr[_ -]?text|secret|token'
done

printf '[status] status checks passed\n'
