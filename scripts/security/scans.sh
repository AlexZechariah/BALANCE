#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  ROOT_DIR="$(cygpath -u "$ROOT_DIR")"
fi
cd "$ROOT_DIR"

status=0
BASH_BIN="${BASH:-bash}"

run_scan() {
  local name="$1"
  shift
  printf '\n[scans] running %s\n' "$name"
  if "$@"; then
    printf '[scans] %s passed\n' "$name"
  else
    local exit_code=$?
    printf '[scans] %s failed with exit code %s\n' "$name" "$exit_code" >&2
    status=1
  fi
}

run_scan gitleaks "$BASH_BIN" "scripts/security/gitleaks.sh"
run_scan osv "$BASH_BIN" "scripts/security/osv.sh"
run_scan trivyfs "$BASH_BIN" "scripts/security/trivyfs.sh"
run_scan semgrep "$BASH_BIN" "scripts/security/semgrep.sh"
run_scan prisma "$BASH_BIN" "scripts/security/prisma.sh"
run_scan hadolint "$BASH_BIN" "scripts/security/hadolint.sh"
run_scan trivyimage "$BASH_BIN" "scripts/security/trivyimage.sh"

if [ "$status" -ne 0 ]; then
  printf '\n[scans] one or more required scans failed\n' >&2
  exit "$status"
fi

printf '\n[scans] all required scans passed\n'
