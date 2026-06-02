#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

if ! HADOLINT="$(resolve_tool hadolint /c/Tools/hadolint/2.14.0/hadolint.exe)"; then
  cat >&2 <<'MSG'
[hadolint] hadolint is not installed or not on PATH.
[hadolint] No network install is attempted by this script.
MSG
  exit 2
fi

mapfile -t DOCKERFILES < <(rg --files -g 'Dockerfile*' -g '*.dockerfile')
if [ "${#DOCKERFILES[@]}" -eq 0 ]; then
  printf '[hadolint] no Dockerfiles found\n' >&2
  exit 2
fi

"$HADOLINT" --failure-threshold warning "${DOCKERFILES[@]}"
