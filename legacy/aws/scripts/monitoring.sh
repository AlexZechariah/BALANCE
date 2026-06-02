#!/usr/bin/env bash
# scripts/verify/monitoring.sh
# Verifies that the observability stack is healthy on the target host.
# Run this on the target EC2 host after the monitoring stack is deployed.

set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    FAIL=$((FAIL + 1))
  fi
}

validate_prometheus_targets() {
  local targets_json
  targets_json="$(curl -fsSL http://127.0.0.1:9090/api/v1/targets)"

  TARGETS_JSON="$targets_json" python3 - <<'PY'
import json
import os
import sys

payload = json.loads(os.environ["TARGETS_JSON"])
active_targets = payload.get("data", {}).get("activeTargets", [])

expected = {"prometheus", "node_exporter", "cadvisor"}
healthy = set()

for target in active_targets:
  labels = target.get("labels", {}) or {}
  discovered = target.get("discoveredLabels", {}) or {}
  job = labels.get("job") or discovered.get("__meta_prometheus_job")
  health = target.get("health")
  if job in expected and health == "up":
    healthy.add(job)

missing = sorted(expected - healthy)
if missing:
  print("Missing or unhealthy Prometheus targets: " + ", ".join(missing), file=sys.stderr)
  sys.exit(1)

print("Expected Prometheus targets are up: " + ", ".join(sorted(healthy)))
PY
}

echo ""
echo "=== Balance Monitoring Verification ==="
echo ""

echo "-- Host exporter --"
check "node_exporter service is active" "systemctl is-active --quiet node-exporter"
check "node_exporter metrics endpoint responds" "curl -fsSL http://127.0.0.1:9100/metrics"

echo ""
echo "-- Monitoring containers --"
check "Prometheus container is running" "docker ps --filter 'name=balance-prometheus' --filter 'status=running' | grep -q balance-prometheus"
check "Grafana container is running"    "docker ps --filter 'name=balance-grafana' --filter 'status=running' | grep -q balance-grafana"
check "cAdvisor container is running"  "docker ps --filter 'name=balance-cadvisor' --filter 'status=running' | grep -q balance-cadvisor"

echo ""
echo "-- Prometheus --"
check "Prometheus health endpoint responds"   "curl -fsSL http://127.0.0.1:9090/-/healthy"
check "Prometheus targets endpoint responds"  "curl -fsSL http://127.0.0.1:9090/api/v1/targets"
check "Expected Prometheus targets are healthy" "validate_prometheus_targets"

echo ""
echo "-- Grafana --"
check "Grafana login page responds on port 3002" "curl -fsSL http://127.0.0.1:3002/login"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "One or more checks failed. Review the output above."
  exit 1
else
  echo "All checks passed. Balance monitoring stack is healthy."
fi
