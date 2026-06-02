#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

if ! TRIVY="$(resolve_tool trivy /c/Tools/trivy/0.70.0/bin/trivy.exe)"; then
  cat >&2 <<'MSG'
[trivyimage] trivy is not installed or not on PATH.
[trivyimage] No network install is attempted by this script.
MSG
  exit 2
fi

if [ "$#" -gt 0 ]; then
  IMAGES=("$@")
else
  read -r -a IMAGES <<< "${BALANCE_SCAN_IMAGES:-balance-local-api:latest balance-local-web:latest balance-local-worker:latest}"
fi

for image in "${IMAGES[@]}"; do
  printf '[trivyimage] scanning %s\n' "$image"
  "$TRIVY" image \
    --scanners vuln,misconfig,secret \
    --severity HIGH,CRITICAL \
    --exit-code 1 \
    --no-progress \
    "$image"
done
