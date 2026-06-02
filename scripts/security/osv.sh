#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

OSV_FALLBACK="$(winget_osv_path || true)"
if ! OSV_SCANNER="$(resolve_tool osv-scanner "$OSV_FALLBACK")"; then
  cat >&2 <<'MSG'
[osv] osv-scanner is not installed or not on PATH.
[osv] No network install is attempted by this script.
MSG
  exit 2
fi

if ! NODE_BIN="$(resolve_tool node "$(command -v node.exe 2>/dev/null || true)")"; then
  cat >&2 <<'MSG'
[osv] node is not installed or not on PATH.
[osv] No network install is attempted by this script.
MSG
  exit 2
fi

report="$(mktemp)"
trap 'rm -f "$report"' EXIT

pnpm_lockfile="$ROOT_DIR/pnpm-lock.yaml"
worker_lockfile="$ROOT_DIR/services/worker/requirements.txt"
node_report="$report"
if command -v wslpath >/dev/null 2>&1; then
  case "$OSV_SCANNER" in
    /mnt/*/*.exe)
      pnpm_lockfile="$(wslpath -w "$pnpm_lockfile")"
      worker_lockfile="$(wslpath -w "$worker_lockfile")"
      ;;
  esac
  case "$NODE_BIN" in
    *node.exe)
      node_report="$(wslpath -w "$node_report")"
      ;;
  esac
fi

set +e
"$OSV_SCANNER" scan source \
  --format json \
  --lockfile "$pnpm_lockfile" \
  --lockfile "$worker_lockfile" \
  >"$report"
scan_status=$?
set -e

"$NODE_BIN" - "$node_report" <<'NODE'
const fs = require('node:fs');

const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const findings = [];

for (const result of report.results ?? []) {
  for (const pkg of result.packages ?? []) {
    const source = result.source?.path ?? 'unknown source';
    const name = pkg.package?.name ?? 'unknown package';
    const version = pkg.package?.version ?? 'unknown version';
    for (const group of pkg.groups ?? []) {
      const score = Number.parseFloat(group.max_severity ?? '0');
      const severity = score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : score > 0 ? 'low' : 'unknown';
      findings.push({
        id: (group.ids ?? ['unknown'])[0],
        severity,
        score,
        name,
        version,
        source
      });
    }
  }
}

if (findings.length === 0) {
  console.log('[osv] no vulnerabilities found');
  process.exit(0);
}

for (const finding of findings) {
  console.log(`[osv] ${finding.severity} ${finding.id} ${finding.name}@${finding.version} score=${finding.score} source=${finding.source}`);
}

const blocking = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high' || finding.severity === 'medium');
if (blocking.length > 0) {
  console.error(`[osv] ${blocking.length} medium/high/critical finding(s) block acceptance`);
  process.exit(1);
}

console.log(`[osv] ${findings.length} non-blocking low/unknown finding(s) require triage`);
NODE

if [ "$scan_status" -ne 0 ]; then
  printf '[osv] scanner returned %s; policy accepted because no medium/high/critical findings were reported\n' "$scan_status"
fi
