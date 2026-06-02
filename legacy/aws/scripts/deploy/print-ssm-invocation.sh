#!/usr/bin/env bash
# print-ssm-invocation.sh
#
# Fetch and format AWS SSM command invocation output as clean multiline logs.
# Uses jq to extract fields and GitHub Actions log grouping for readability.
#
# Required environment variables:
#   SSM_REGION       AWS region for SSM
#   COMMAND_ID       SSM command ID
#   SSM_INSTANCE_ID  SSM target instance ID

set -euo pipefail

: "${SSM_REGION:?SSM_REGION is required}"
: "${COMMAND_ID:?COMMAND_ID is required}"
: "${SSM_INSTANCE_ID:?SSM_INSTANCE_ID is required}"

# Fetch invocation JSON once
INVOCATION_JSON="$(aws ssm get-command-invocation \
  --region "$SSM_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$SSM_INSTANCE_ID" \
  --output json)"

# Extract fields with jq
STATUS="$(printf '%s' "$INVOCATION_JSON" | jq -r '.Status // "unknown"')"
STATUS_DETAILS="$(printf '%s' "$INVOCATION_JSON" | jq -r '.StatusDetails // "unknown"')"
RESPONSE_CODE="$(printf '%s' "$INVOCATION_JSON" | jq -r '.ResponseCode // -1')"
STDOUT_CONTENT="$(printf '%s' "$INVOCATION_JSON" | jq -r '.StandardOutputContent // ""')"
STDERR_CONTENT="$(printf '%s' "$INVOCATION_JSON" | jq -r '.StandardErrorContent // ""')"

# Print status header
printf 'SSM status: %s\n' "$STATUS"
printf 'SSM status details: %s\n' "$STATUS_DETAILS"
printf 'SSM response code: %s\n' "$RESPONSE_CODE"

# Print standard output as clean multiline text
if [ -n "$STDOUT_CONTENT" ]; then
  echo "::group::SSM standard output"
  printf '%s\n' "$STDOUT_CONTENT"
  echo "::endgroup::"
fi

# Print standard error as clean multiline text
if [ -n "$STDERR_CONTENT" ]; then
  echo "::group::SSM standard error"
  printf '%s\n' "$STDERR_CONTENT"
  echo "::endgroup::"
fi
