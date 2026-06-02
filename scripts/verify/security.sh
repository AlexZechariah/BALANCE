#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT_DIR="$(cygpath -u "$ROOT_DIR")"
fi
cd "$ROOT_DIR"

status=0
BASH_BIN="${BASH:-bash}"

run_gate() {
  local name="$1"
  shift
  printf '\n[security] running %s\n' "$name"
  if "$@"; then
    printf '[security] %s passed\n' "$name"
  else
    local exit_code=$?
    printf '[security] %s failed with exit code %s\n' "$name" "$exit_code" >&2
    status=1
  fi
}

run_gate auth "$BASH_BIN" "scripts/verify/auth.sh"
run_gate authz "$BASH_BIN" "scripts/verify/authz.sh"
run_gate upload "$BASH_BIN" "scripts/verify/upload.sh"
run_gate storage "$BASH_BIN" "scripts/verify/storage.sh"
run_gate scans "$BASH_BIN" "scripts/security/scans.sh"

if [ "$status" -ne 0 ]; then
  printf '\n[security] one or more security gates failed\n' >&2
  exit "$status"
fi

printf '\n[security] all security gates passed\n'
