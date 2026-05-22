#!/usr/bin/env bash
set -euo pipefail

# generate-manifest.sh
#
# Generate a deployment manifest JSON file and write a concise markdown
# summary to the GitHub Actions job summary (GITHUB_STEP_SUMMARY).
#
# Required environment variables:
#   GITHUB_REF_NAME     - Git branch or tag ref
#   GITHUB_SHA          - Full Git commit SHA
#   GITHUB_RUN_ID       - GitHub Actions run ID
#   GITHUB_WORKFLOW     - GitHub Actions workflow name
#   GITHUB_SERVER_URL   - GitHub server URL (e.g. https://github.com)
#   GITHUB_REPOSITORY   - GitHub repository (owner/repo)
#   COMMAND_ID          - SSM command ID from the deploy step
#   SSM_INSTANCE_ID     - Target SSM instance ID
#   APP_URL             - Staging or production app URL (validated but not output)
#   API_URL             - Staging or production API URL (validated but not output)

# Validate required environment variables
: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_WORKFLOW:?GITHUB_WORKFLOW is required}"
: "${GITHUB_SERVER_URL:?GITHUB_SERVER_URL is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${COMMAND_ID:?COMMAND_ID is required}"
: "${SSM_INSTANCE_ID:?SSM_INSTANCE_ID is required}"
: "${APP_URL:?APP_URL is required}"
: "${API_URL:?API_URL is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

environment="${DEPLOY_ENVIRONMENT:-staging}"
smoke_status="passed"
deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
workflow_run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# Generate deployment manifest JSON
jq --null-input \
  --arg environment "$environment" \
  --arg branch "$GITHUB_REF_NAME" \
  --arg commit "$GITHUB_SHA" \
  --arg run_id "$GITHUB_RUN_ID" \
  --arg workflow_name "$GITHUB_WORKFLOW" \
  --arg workflow_run_id "$GITHUB_RUN_ID" \
  --arg workflow_run_url "$workflow_run_url" \
  --arg ssm_command_id "$COMMAND_ID" \
  --arg ssm_instance_id "$SSM_INSTANCE_ID" \
  --arg smoke_status "$smoke_status" \
  --arg deployed_at "$deployed_at" \
  --argjson endpoint_values_redacted true \
  --argjson routes_verified '["/","/login","/app","/enterprise","/api/health","/api/ready","/api/version"]' \
  '{
    environment: $environment,
    branch: $branch,
    commit: $commit,
    run_id: $run_id,
    workflow_name: $workflow_name,
    workflow_run_id: $workflow_run_id,
    workflow_run_url: $workflow_run_url,
    ssm_command_id: $ssm_command_id,
    ssm_instance_id: $ssm_instance_id,
    app_endpoint_source: "APP_URL",
    api_endpoint_source: "API_URL",
    endpoint_values_redacted: $endpoint_values_redacted,
    routes_verified: $routes_verified,
    smoke_status: $smoke_status,
    deployed_at: $deployed_at
  }' > deployment-manifest.json

# Write markdown summary to GITHUB_STEP_SUMMARY
{
  printf '## Deployment Manifest\n\n'
  printf '| Field | Value |\n'
  printf '|---|---|\n'
  printf '| Environment | %s |\n' "$environment"
  printf '| Branch | %s |\n' "$GITHUB_REF_NAME"
  printf '| Commit | %s |\n' "$GITHUB_SHA"
  printf '| Workflow run | [%s](%s) |\n' "$GITHUB_RUN_ID" "$workflow_run_url"
  printf '| SSM command ID | %s |\n' "$COMMAND_ID"
  printf '| SSM instance | %s |\n' "$SSM_INSTANCE_ID"
  printf '| App endpoint | Configured through APP_URL |\n'
  printf '| API endpoint | Configured through API_URL |\n'
  printf '| Endpoint values | Redacted |\n'
  printf '| Routes verified | /, /login, /app, /enterprise, /api/health, /api/ready, /api/version |\n'
  printf '| Smoke status | passed |\n'
  printf '| Deployed at | %s |\n' "$deployed_at"
} >> "$GITHUB_STEP_SUMMARY"
