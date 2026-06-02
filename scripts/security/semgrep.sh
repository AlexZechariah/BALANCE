#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

if ! SEMGREP="$(resolve_tool semgrep "$HOME/.local/bin/semgrep.exe")"; then
  cat >&2 <<'MSG'
[semgrep] semgrep is not installed or not on PATH.
[semgrep] No network install is attempted by this script.
MSG
  exit 2
fi

"$SEMGREP" scan \
  --config auto \
  --error \
  --exclude docs \
  --exclude legacy \
  --exclude node_modules \
  "$ROOT_DIR"
