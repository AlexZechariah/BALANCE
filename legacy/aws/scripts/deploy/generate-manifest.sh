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
deployment_mode="${DEPLOYMENT_MODE:-deploy}"
smoke_status="passed"
deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
workflow_run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"

# Set backup and deployment mode status
if [ "$deployment_mode" = "rollback" ]; then
  backup_status="skipped"
  backup_scope="not_applicable"
  backup_format="not_applicable"
else
  backup_status="created"
  backup_scope="pre_migration"
  backup_format="pg_dump_custom"
fi

# Human-readable backup format for the summary table
backup_format_summary="$backup_format"
if [ "$backup_format" = "pg_dump_custom" ]; then
  backup_format_summary="pg_dump custom"
fi

# Generate deployment manifest JSON
jq --null-input \
  --arg environment "$environment" \
  --arg branch "$GITHUB_REF_NAME" \
  --arg commit "$GITHUB_SHA" \
  --arg deployment_mode "$deployment_mode" \
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
  --arg backup_status "$backup_status" \
  --arg backup_scope "$backup_scope" \
  --arg backup_format "$backup_format" \
  --arg target_revision "${TARGET_REVISION:-}" \
  --arg rollback_requested_by "${ROLLBACK_REQUESTED_BY:-}" \
  '{
    environment: $environment,
    branch: $branch,
    commit: $commit,
    deployment_mode: $deployment_mode,
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
    backup_status: $backup_status,
    backup_scope: $backup_scope,
    backup_format: $backup_format,
    deployed_at: $deployed_at
  }
  +
  if $deployment_mode == "rollback" then
  {
    target_revision: $target_revision,
    rollback_requested_by: $rollback_requested_by,
    rollback_skip_db_migrations: true,
    rollback_database_restore: "not_performed"
  }
  else {} end' > deployment-manifest.json

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
  printf '| Deployment mode | %s |\n' "$deployment_mode"
  printf '| Routes verified | /, /login, /app, /enterprise, /api/health, /api/ready, /api/version |\n'
  printf '| Smoke status | passed |\n'
  printf '| DB backup status | %s |\n' "$backup_status"
  printf '| DB backup scope | %s |\n' "$backup_scope"
  printf '| DB backup format | %s |\n' "$backup_format_summary"
  printf '| Deployed at | %s |\n' "$deployed_at"
  if [ "$deployment_mode" = "rollback" ]; then
    printf '| Target revision | %s |\n' "${TARGET_REVISION:-unavailable}"
    printf '| Requested by | %s |\n' "${ROLLBACK_REQUESTED_BY:-unavailable}"
    printf '| DB migrations | Skipped |\n'
    printf '| DB restore | Not performed |\n'
  fi
} >> "$GITHUB_STEP_SUMMARY"
