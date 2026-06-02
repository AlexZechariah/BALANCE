#!/usr/bin/env bash
# diagnose-deploy-failure.sh
#
# Best-effort deployment failure diagnostics.
# Writes a concise markdown summary to GITHUB_STEP_SUMMARY.
# Exits 0 so diagnostics do not mask the original workflow failure.
#
# Environment variables consumed:
#   GITHUB_STEP_SUMMARY  (required)
#   GITHUB_REF_NAME      Git branch or tag ref
#   GITHUB_SHA           Full commit SHA
#   GITHUB_SERVER_URL    GitHub server URL
#   GITHUB_REPOSITORY    GitHub repository (owner/repo)
#   GITHUB_RUN_ID        GitHub Actions run ID
#   GITHUB_JOB_ID        Job identifier (deploy-staging or deploy)
#   COMMAND_ID           SSM command ID (set by send-command step via GITHUB_ENV)
#   SSM_INSTANCE_ID      SSM target instance ID
#   SSM_REGION           AWS region for SSM

: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

# Best-effort: do not fail the diagnostics step on missing data
set +e
set -u

{
  printf '## Deployment Diagnostics\n\n'
  printf '| Field | Value |\n'
  printf '|---|---|\n'
  printf '| Environment | staging |\n'
  printf '| Branch | %s |\n' "${GITHUB_REF_NAME:-unavailable}"
  printf '| Commit | %s |\n' "${GITHUB_SHA:-unavailable}"
  printf '| Failed job | %s |\n' "${GITHUB_JOB_ID:-unavailable}"

  # Workflow run link
  if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
    printf '| Workflow run | [%s](%s/%s/actions/runs/%s) |\n' \
      "$GITHUB_RUN_ID" "$GITHUB_SERVER_URL" "$GITHUB_REPOSITORY" "$GITHUB_RUN_ID"
  else
    printf '| Workflow run | unavailable |\n'
  fi

  # SSM diagnostics
  if [ -n "${COMMAND_ID:-}" ]; then
    printf '| SSM command ID | %s |\n' "$COMMAND_ID"
    printf '| SSM instance | %s |\n' "${SSM_INSTANCE_ID:-unavailable}"

    SSM_OUTPUT=$(aws ssm get-command-invocation \
      --region "${SSM_REGION:-ap-southeast-5}" \
      --command-id "$COMMAND_ID" \
      --instance-id "${SSM_INSTANCE_ID:-}" \
      --query '{Status:Status,StatusDetails:StatusDetails,ResponseCode:ResponseCode}' \
      --output json 2>/dev/null)

    if [ -n "$SSM_OUTPUT" ]; then
      printf '| SSM status | %s |\n' "$(printf '%s' "$SSM_OUTPUT" | jq -r '.Status // "unavailable"')"
      printf '| SSM status details | %s |\n' "$(printf '%s' "$SSM_OUTPUT" | jq -r '.StatusDetails // "unavailable"')"
      printf '| SSM response code | %s |\n' "$(printf '%s' "$SSM_OUTPUT" | jq -r '.ResponseCode // "unavailable"')"
    else
      printf '| SSM status | Query failed |\n'
    fi
  else
    printf '| SSM command ID | Not dispatched |\n'
  fi

  # Endpoint values redacted
  printf '| Endpoint values | Redacted |\n'
  printf '| Deployed at | %s |\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo 'unavailable')"
} >> "$GITHUB_STEP_SUMMARY"

exit 0
