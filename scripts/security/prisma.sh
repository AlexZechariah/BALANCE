#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if ! command -v rg >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[prisma] ripgrep is required.
MSG
  exit 2
fi

SCAN_PATHS=(apps packages scripts)
COMMON_GLOBS=(
  --glob '!packages/db/src/generated/**'
  --glob '!apps/**/test/**'
  --glob '!apps/api/src/prisma/prisma-security.rules.ts'
  --glob '!scripts/security/prisma.sh'
  --glob '!**/node_modules/**'
  --glob '!**/dist/**'
  --glob '!**/build/**'
)

unsafe_hits="$(
  rg -n -F \
    -e '$queryRawUnsafe' \
    -e '$executeRawUnsafe' \
    "${COMMON_GLOBS[@]}" \
    "${SCAN_PATHS[@]}" || true
)"

if [[ -n "$unsafe_hits" ]]; then
  cat >&2 <<'MSG'
[prisma] unsafe Prisma raw SQL APIs are not allowed in active source without explicit review.
MSG
  printf '%s\n' "$unsafe_hits" >&2
  exit 1
fi

concat_hits="$(
  rg -n \
    -e '(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^`]*\+' \
    -e '\+[^`]*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)' \
    "${COMMON_GLOBS[@]}" \
    "${SCAN_PATHS[@]}" || true
)"

if [[ -n "$concat_hits" ]]; then
  cat >&2 <<'MSG'
[prisma] possible string-concatenated SQL found. Use Prisma safe APIs or tagged raw SQL with bound parameters.
MSG
  printf '%s\n' "$concat_hits" >&2
  exit 1
fi

echo '[prisma] no unsafe Prisma raw SQL APIs or string-concatenated SQL found'
