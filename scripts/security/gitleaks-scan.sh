#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v gitleaks >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[gitleaks-scan] gitleaks is not installed or not on PATH.
[gitleaks-scan] No network install is attempted by this script.
MSG
  exit 2
fi

gitleaks detect \
  --source "$ROOT_DIR" \
  --no-banner \
  --redact \
  --verbose
