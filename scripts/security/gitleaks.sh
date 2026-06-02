#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/security/tools.sh"

if ! GITLEAKS="$(resolve_tool gitleaks /c/Tools/gitleaks.exe)"; then
  cat >&2 <<'MSG'
[gitleaks] gitleaks is not installed or not on PATH.
[gitleaks] No network install is attempted by this script.
MSG
  exit 2
fi

"$GITLEAKS" detect \
  --source "$ROOT_DIR" \
  --no-banner \
  --redact \
  --verbose
