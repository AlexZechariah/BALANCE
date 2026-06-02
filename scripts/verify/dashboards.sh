#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BALANCE_VERIFY_LIVE="${BALANCE_VERIFY_LIVE:-1}"
GRAFANA_ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}"
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-change-me-for-local-only}"
DASHBOARD_DIR="${DASHBOARD_DIR:-infra/observability/grafana/dashboards}"

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf '[dashboards] required command not found: %s\n' "$name" >&2
    exit 1
  fi
}

require_command node

printf '[dashboards] checking Grafana dashboard JSON and provisioning files\n'
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const dashboardDir = process.env.DASHBOARD_DIR || "infra/observability/grafana/dashboards";
const requiredUids = new Set([
  "balance-overview",
  "balance-api-health-latency",
  "balance-worker-ocr-pipeline",
  "balance-web-health-vitals",
  "balance-queue-redis",
  "balance-postgresql",
  "balance-upload-storage-safety",
  "balance-security-abuse-controls",
  "balance-public-status-gatus",
  "balance-logs-trace-correlation",
  "balance-profiles-hot-paths",
]);
const forbidden = /document[_-]?id|claim[_-]?id|review[_-]?id|user[_-]?id|session[_-]?id|token|storage[_-]?key|ocr[_-]?text|authorization|cookie|password|secret|database_url|redis_url/i;
const files = fs.readdirSync(dashboardDir).filter((file) => file.endsWith(".json")).sort();
const seen = new Map();
const failures = [];

for (const file of files) {
  const fullPath = path.join(dashboardDir, file);
  const text = fs.readFileSync(fullPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failures.push(`${file}: invalid JSON: ${error.message}`);
    continue;
  }
  if (!parsed.uid || !parsed.title) {
    failures.push(`${file}: missing dashboard uid or title`);
  }
  if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) {
    failures.push(`${file}: no panels`);
  }
  if (forbidden.test(text)) {
    failures.push(`${file}: contains prohibited sensitive field text`);
  }
  seen.set(parsed.uid, parsed.title);
}

for (const uid of requiredUids) {
  if (!seen.has(uid)) {
    failures.push(`missing required dashboard uid: ${uid}`);
  }
}

if (files.length < requiredUids.size) {
  failures.push(`expected at least ${requiredUids.size} dashboards, found ${files.length}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

for (const [uid, title] of seen) {
  console.log(`${uid}: ${title}`);
}
NODE

if ! grep -F 'path: /var/lib/grafana/dashboards' infra/observability/grafana/dashboards.yml >/dev/null; then
  printf '[dashboards] Grafana dashboard provisioning path is missing\n' >&2
  exit 1
fi

if ! grep -F 'uid: prometheus' infra/observability/grafana/datasources.yml >/dev/null ||
   ! grep -F 'uid: loki' infra/observability/grafana/datasources.yml >/dev/null ||
   ! grep -F 'uid: tempo' infra/observability/grafana/datasources.yml >/dev/null ||
   ! grep -F 'uid: pyroscope' infra/observability/grafana/datasources.yml >/dev/null; then
  printf '[dashboards] required Grafana datasources are missing\n' >&2
  exit 1
fi

if [ "$BALANCE_VERIFY_LIVE" = "0" ]; then
  printf '[dashboards] live Grafana checks skipped because BALANCE_VERIFY_LIVE=0\n'
  exit 0
fi

require_command curl

printf '[dashboards] checking live Grafana health and dashboard search\n'
curl --fail --show-error --silent --max-time 15 'http://127.0.0.1:3002/api/health' >/dev/null
dashboard_search="$(curl --fail --show-error --silent --max-time 20 \
  --user "${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}" \
  'http://127.0.0.1:3002/api/search?query=Balance')"

for title in \
  'Balance Overview' \
  'Balance API Health And Latency' \
  'Balance Worker OCR Pipeline' \
  'Balance Web Health And Web Vitals' \
  'Balance Public Status Gatus Checks'; do
  if ! printf '%s' "$dashboard_search" | grep -F "$title" >/dev/null; then
    printf '[dashboards] live Grafana search did not include dashboard: %s\n' "$title" >&2
    exit 1
  fi
done

printf '[dashboards] dashboard checks passed\n'
