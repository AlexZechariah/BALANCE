#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose/compose.local.yml}"
BALANCE_VERIFY_LIVE="${BALANCE_VERIFY_LIVE:-1}"
compose=(docker compose --project-directory "$ROOT_DIR" -f "$COMPOSE_FILE")

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '[observability] required command not found: %s\n' "$name" >&2
    exit 1
  fi
}

assert_service_present() {
  local service="$1"
  local services="$2"
  if ! printf '%s\n' "$services" | grep -Fx "$service" >/dev/null; then
    printf '[observability] expected Compose service missing: %s\n' "$service" >&2
    exit 1
  fi
}

assert_service_absent() {
  local service="$1"
  local services="$2"
  if printf '%s\n' "$services" | grep -Fx "$service" >/dev/null; then
    printf '[observability] service must not be in this profile: %s\n' "$service" >&2
    exit 1
  fi
}

assert_no_static_match() {
  local pattern="$1"
  shift
  local matches
  matches="$(grep -REn -- "$pattern" "$@" 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    printf '[observability] prohibited runtime pattern found:\n' >&2
    printf '%s\n' "$matches" >&2
    exit 1
  fi
}

assert_static_match() {
  local pattern="$1"
  shift
  if ! grep -REq -- "$pattern" "$@" 2>/dev/null; then
    printf '[observability] required static pattern missing: %s\n' "$pattern" >&2
    printf '[observability] checked files: %s\n' "$*" >&2
    exit 1
  fi
}

require_command docker

node_cmd=(node)
if ! command -v node >/dev/null 2>&1; then
  require_command pnpm
  node_cmd=(pnpm exec node)
fi

printf '[observability] checking Docker Compose config\n'
"${compose[@]}" config --quiet
"${compose[@]}" --profile production config --quiet
"${compose[@]}" --profile observe-deep config --quiet

default_services="$("${compose[@]}" config --services)"
deep_services="$("${compose[@]}" --profile observe-deep config --services)"

for service in \
  postgres redis worker api web prometheus alertmanager grafana loki tempo alloy \
  pyroscope gatus ntfy postgres-exporter redis-exporter blackbox-exporter; do
  assert_service_present "$service" "$default_services"
done

for service in caddy authelia node-exporter cadvisor; do
  assert_service_absent "$service" "$default_services"
done

assert_service_present node-exporter "$deep_services"
assert_service_absent cadvisor "$deep_services"

printf '[observability] checking loopback-only observability port bindings\n'
"${compose[@]}" config --format json | "${node_cmd[@]}" -e '
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(0, "utf8"));
const loopbackServices = new Set([
  "prometheus",
  "alertmanager",
  "grafana",
  "loki",
  "tempo",
  "pyroscope",
  "gatus",
  "ntfy",
]);
const failures = [];
for (const service of loopbackServices) {
  const ports = config.services?.[service]?.ports ?? [];
  if (ports.length === 0) {
    failures.push(`${service}: no published port found`);
    continue;
  }
  for (const port of ports) {
    if (port.published && port.host_ip !== "127.0.0.1") {
      failures.push(`${service}: published ${port.published} on ${port.host_ip || "<all interfaces>"}`);
    }
  }
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
'

printf '[observability] checking default profile has no broad host access\n'
assert_no_static_match 'privileged:[[:space:]]*true|/var/run/docker\.sock|source:[[:space:]]*/|source:[[:space:]]*/var/lib/docker|target:[[:space:]]*/host|target:[[:space:]]*/var/lib/docker' \
  infra/compose/compose.local.yml infra/observability

printf '[observability] checking static SLO, retention, cardinality, and correlation guardrails\n'
assert_static_match 'record:' infra/observability/prometheus/rules.yml
assert_static_match 'alert:' infra/observability/prometheus/rules.yml
assert_static_match 'runbook_url:' infra/observability/prometheus/rules.yml
for recording_rule in \
  'balance_api:http_5xx_rate:5m' \
  'balance_auth:failure_rate:5m' \
  'balance_auth:csrf_failure_rate:5m' \
  'balance_queue:wait_seconds:p95_5m' \
  'balance_upload:rejection_rate:5m' \
  'balance_worker:job_duration:p95_5m'; do
  assert_static_match "$recording_rule" infra/observability/prometheus/rules.yml
done
alert_count="$(grep -Ec '^[[:space:]]*- alert:' infra/observability/prometheus/rules.yml)"
runbook_count="$(grep -Ec '^[[:space:]]*runbook_url:' infra/observability/prometheus/rules.yml)"
first_check_count="$(grep -Ec '^[[:space:]]*first_check:' infra/observability/prometheus/rules.yml)"
severity_meaning_count="$(grep -Ec '^[[:space:]]*severity_meaning:' infra/observability/prometheus/rules.yml)"
if [ "$alert_count" -ne "$runbook_count" ]; then
  printf '[observability] every alert must include one runbook_url annotation: alerts=%s runbooks=%s\n' "$alert_count" "$runbook_count" >&2
  exit 1
fi
if [ "$alert_count" -ne "$first_check_count" ]; then
  printf '[observability] every alert must include one first_check annotation: alerts=%s first_check=%s\n' "$alert_count" "$first_check_count" >&2
  exit 1
fi
if [ "$alert_count" -ne "$severity_meaning_count" ]; then
  printf '[observability] every alert must include one severity_meaning annotation: alerts=%s severity_meaning=%s\n' "$alert_count" "$severity_meaning_count" >&2
  exit 1
fi
assert_static_match '--storage\.tsdb\.retention\.time=14d' infra/compose/compose.local.yml
assert_static_match 'retention_period:[[:space:]]*336h' infra/observability/loki/loki.yml
assert_static_match 'block_retention:[[:space:]]*336h' infra/observability/tempo/tempo.yml
assert_static_match 'max_label_names_per_series:[[:space:]]*15' infra/observability/loki/loki.yml
assert_static_match 'traceId' apps/api/src/observability/runtime.ts infra/observability/grafana/dashboards/logs-trace-correlation.json
assert_static_match 'spanId' apps/api/src/observability/runtime.ts infra/observability/grafana/dashboards/logs-trace-correlation.json

if [ "$BALANCE_VERIFY_LIVE" = "0" ]; then
  printf '[observability] live endpoint checks skipped because BALANCE_VERIFY_LIVE=0\n'
  exit 0
fi

require_command curl

check_url() {
  local name="$1"
  local url="$2"

  printf '[observability] checking %s at %s\n' "$name" "$url"
  curl --fail --show-error --silent --max-time 15 "$url" >/dev/null
}

check_url 'Gatus config' 'http://127.0.0.1:8080/api/v1/config'
check_url 'Grafana health' 'http://127.0.0.1:3002/api/health'
check_url 'Prometheus health' 'http://127.0.0.1:9090/-/healthy'
check_url 'Alertmanager health' 'http://127.0.0.1:9093/-/healthy'
check_url 'Loki readiness' 'http://127.0.0.1:3100/ready'
check_url 'Tempo readiness' 'http://127.0.0.1:3200/ready'
check_url 'Pyroscope readiness' 'http://127.0.0.1:4040/ready'
check_url 'ntfy health' 'http://127.0.0.1:8081/v1/health'

printf '[observability] observability checks passed\n'
