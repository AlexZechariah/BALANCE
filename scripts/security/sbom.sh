#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/security/tools.sh"

REQUIRED_VERSION="${SYFT_REQUIRED_VERSION:-1.44.0}"
OUTPUT_PATH="${1:-}"

if [ -z "$OUTPUT_PATH" ]; then
  printf '[sbom] usage: scripts/security/sbom.sh <output-path>\n' >&2
  exit 2
fi

if ! SYFT="$(resolve_tool syft)"; then
  printf '[sbom] syft %s is required and was not found on PATH\n' "$REQUIRED_VERSION" >&2
  exit 2
fi

actual_version="$("$SYFT" version -o json | node -e "let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>console.log(JSON.parse(input).version))")"
if [ "$actual_version" != "$REQUIRED_VERSION" ]; then
  printf '[sbom] expected syft %s, found %s\n' "$REQUIRED_VERSION" "$actual_version" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
"$SYFT" dir:"$ROOT_DIR" -o "cyclonedx-json=$OUTPUT_PATH"
printf '[sbom] wrote CycloneDX SBOM to %s\n' "$OUTPUT_PATH"
