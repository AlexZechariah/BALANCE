#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

if ! TRIVY="$(resolve_tool trivy /c/Tools/trivy/0.70.0/bin/trivy.exe)"; then
  cat >&2 <<'MSG'
[trivyfs] trivy is not installed or not on PATH.
[trivyfs] No network install is attempted by this script.
MSG
  exit 2
fi

"$TRIVY" fs \
  --scanners vuln,misconfig,secret \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --no-progress \
  --skip-dirs .codex \
  --skip-dirs .git \
  --skip-dirs .opencode \
  --skip-dirs data \
  --skip-dirs docs \
  --skip-dirs legacy \
  --skip-dirs local-fixtures \
  --skip-dirs node_modules \
  "$ROOT_DIR"
