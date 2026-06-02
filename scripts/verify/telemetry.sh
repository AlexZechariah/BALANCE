#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose/compose.local.yml}"
BALANCE_VERIFY_LIVE="${BALANCE_VERIFY_LIVE:-1}"
compose=(docker compose --project-directory "$ROOT_DIR" -f "$COMPOSE_FILE")
forbidden_metrics_pattern='document[_-]?id|claim[_-]?id|review[_-]?id|user[_-]?id|session[_-]?id|session[_-]?token|token|storage[_-]?key|ocr[_-]?text|authorization|cookie|password|secret|database_url|redis_url|request_body|response_body'

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '[telemetry] required command not found: %s\n' "$name" >&2
    exit 1
  fi
}

assert_file_contains() {
  local path="$1"
  local needle="$2"
  if ! grep -F "$needle" "$path" >/dev/null; then
    printf '[telemetry] %s did not contain required text: %s\n' "$path" "$needle" >&2
    exit 1
  fi
}

assert_metrics_safe() {
  local name="$1"
  local metrics="$2"
  local expected_metric="$3"

  if ! printf '%s' "$metrics" | grep -F "$expected_metric" >/dev/null; then
    printf '[telemetry] %s metrics did not include expected metric prefix: %s\n' "$name" "$expected_metric" >&2
    exit 1
  fi

  if printf '%s' "$metrics" | grep -Eiq "$forbidden_metrics_pattern"; then
    printf '[telemetry] %s metrics exposed a prohibited sensitive field\n' "$name" >&2
    printf '%s' "$metrics" | grep -Ein "$forbidden_metrics_pattern" >&2 || true
    exit 1
  fi
}

fetch_node_http() {
  local service="$1"
  local host="$2"
  local port="$3"
  local path="$4"
  local host_header="$5"

  MSYS_NO_PATHCONV=1 "${compose[@]}" exec -T "$service" node - "$host" "$port" "$path" "$host_header" <<'NODE'
const http = require("node:http");
const [host, port, path, hostHeader] = process.argv.slice(2);
const request = http.request({
  hostname: host,
  port,
  path,
  method: "GET",
  headers: hostHeader ? { Host: hostHeader } : {},
  timeout: 10000,
}, (response) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => { body += chunk; });
  response.on("end", () => {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error(`HTTP ${response.statusCode}`);
      process.exit(1);
    }
    process.stdout.write(body);
  });
});
request.on("timeout", () => request.destroy(new Error("timeout")));
request.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
request.end();
NODE
}

fetch_worker_metrics() {
  "${compose[@]}" exec -T worker python3.13 - <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8000/metrics", timeout=10) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"HTTP {response.status}")
        sys.stdout.write(response.read().decode("utf-8"))
except Exception as exc:
    sys.stderr.write(str(exc) + "\n")
    raise SystemExit(1)
PY
}

require_command docker
require_command grep

printf '[telemetry] checking Prometheus scrape config and app telemetry wiring\n'
assert_file_contains 'infra/observability/prometheus/prometheus.yml' 'job_name: balance-api'
assert_file_contains 'infra/observability/prometheus/prometheus.yml' 'job_name: balance-worker'
assert_file_contains 'infra/observability/prometheus/prometheus.yml' 'job_name: balance-web'
assert_file_contains 'infra/observability/prometheus/prometheus.yml' 'metrics_path: /internal/metrics'
assert_file_contains 'apps/web/next.config.ts' ':path((?!metrics$).*)'
assert_file_contains 'infra/compose/compose.local.yml' 'API_OTEL_ENABLED: ${API_OTEL_ENABLED:-true}'
assert_file_contains 'infra/compose/compose.local.yml' 'WORKER_OTEL_ENABLED: ${WORKER_OTEL_ENABLED:-true}'
assert_file_contains 'infra/compose/compose.local.yml' 'WEB_OTEL_ENABLED: ${WEB_OTEL_ENABLED:-true}'
assert_file_contains 'infra/compose/compose.local.yml' 'OTEL_EXPORTER_OTLP_ENDPOINT: http://alloy:4318'
assert_file_contains 'infra/compose/compose.local.yml' 'PYROSCOPE_SERVER_ADDRESS: http://pyroscope:4040'

if [ "$BALANCE_VERIFY_LIVE" = "0" ]; then
  printf '[telemetry] live metrics checks skipped because BALANCE_VERIFY_LIVE=0\n'
  exit 0
fi

require_command curl

printf '[telemetry] checking internal API, worker, and web metrics\n'
api_metrics="$(fetch_node_http api 127.0.0.1 3001 /metrics '')"
worker_metrics="$(fetch_worker_metrics)"
web_metrics="$(fetch_node_http web 127.0.0.1 3000 /internal/metrics web:3000)"

assert_metrics_safe 'api' "$api_metrics" 'balance_api_info'
assert_metrics_safe 'worker' "$worker_metrics" 'balance_worker_process_health'
assert_metrics_safe 'web' "$web_metrics" 'balance_web_info'

public_metrics_status="$(curl --output /dev/null --silent --show-error --write-out '%{http_code}' --max-time 10 'http://localhost:3000/api/metrics' || true)"
if [ "$public_metrics_status" = "200" ]; then
  printf '[telemetry] public web /api/metrics returned HTTP 200, expected blocked/non-public route\n' >&2
  exit 1
fi

printf '[telemetry] telemetry checks passed\n'
