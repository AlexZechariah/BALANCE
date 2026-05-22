#!/usr/bin/env bash
# rollback.sh
#
# Manual staging rollback script.
# Preserves current hardened deployment tooling before checking out the target
# revision, then executes the preserved ssm-deploy.sh with SKIP_DB_MIGRATIONS=true.
#
# This guarantees version-safe rollback: the application code rolls back, but
# the deployment control scripts remain from the current hardened implementation
# even if the target revision predates the hardening changes.
#
# Required environment variables:
#   TARGET_REVISION  Git commit SHA, tag, or branch to roll back to
#   APP_DIR          Application directory (default: /opt/swe40006-project)
#
# Rollback-only environment variables (set by rollback.sh):
#   DEPLOY_TOOLS_DIR  Directory containing preserved deployment tools
#   SKIP_DB_MIGRATIONS  Always set to "true" during rollback
#   GIT_COMMIT         Set to the resolved target commit SHA

set -euo pipefail

# ── Timestamp for logging ───────────────────────────────────────
log_prefix='[rollback]'

# ── Validate TARGET_REVISION ────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/swe40006-project}"
: "${TARGET_REVISION:?${log_prefix} TARGET_REVISION is required}"

case "$TARGET_REVISION" in
  *$'\n'*|*$'\r'*)
    printf '%s ERROR: TARGET_REVISION contains newline or carriage return\n' "$log_prefix" >&2
    exit 1
    ;;
esac

# ── Change to APP_DIR and verify repository ─────────────────────
cd "$APP_DIR"

if [ ! -d .git ]; then
  printf '%s ERROR: Git repository missing in %s\n' "$log_prefix" "$APP_DIR" >&2
  exit 1
fi

# ── Create rollback tools directory ──────────────────────────────
PID=$$
ROLLBACK_TOOLS_DIR="/tmp/swe40006-rollback-tools-${PID}"
install -d -m 0755 "$ROLLBACK_TOOLS_DIR/scripts/deploy" "$ROLLBACK_TOOLS_DIR/scripts/backup"

# ── Preserve current hardened deployment tools ──────────────────
cp scripts/deploy/ssm-deploy.sh    "$ROLLBACK_TOOLS_DIR/scripts/deploy/ssm-deploy.sh"
cp scripts/deploy/rollback.sh      "$ROLLBACK_TOOLS_DIR/scripts/deploy/rollback.sh"
cp scripts/deploy/generate-manifest.sh "$ROLLBACK_TOOLS_DIR/scripts/deploy/generate-manifest.sh"
cp scripts/deploy/diagnose-deploy-failure.sh "$ROLLBACK_TOOLS_DIR/scripts/deploy/diagnose-deploy-failure.sh"
cp scripts/deploy/print-ssm-invocation.sh "$ROLLBACK_TOOLS_DIR/scripts/deploy/print-ssm-invocation.sh"
cp scripts/backup/postgres.sh      "$ROLLBACK_TOOLS_DIR/scripts/backup/postgres.sh"

# Verify all copies exist
for f in ssm-deploy.sh rollback.sh generate-manifest.sh diagnose-deploy-failure.sh print-ssm-invocation.sh; do
  if [ ! -f "$ROLLBACK_TOOLS_DIR/scripts/deploy/$f" ]; then
    printf '%s ERROR: Failed to preserve scripts/deploy/%s\n' "$log_prefix" "$f" >&2
    exit 1
  fi
done
if [ ! -f "$ROLLBACK_TOOLS_DIR/scripts/backup/postgres.sh" ]; then
  printf '%s ERROR: Failed to preserve scripts/backup/postgres.sh\n' "$log_prefix" >&2
  exit 1
fi

# Set executable bits
chmod +x "$ROLLBACK_TOOLS_DIR/scripts/deploy/ssm-deploy.sh"
chmod +x "$ROLLBACK_TOOLS_DIR/scripts/deploy/generate-manifest.sh"
chmod +x "$ROLLBACK_TOOLS_DIR/scripts/deploy/diagnose-deploy-failure.sh"
chmod +x "$ROLLBACK_TOOLS_DIR/scripts/deploy/print-ssm-invocation.sh"
chmod +x "$ROLLBACK_TOOLS_DIR/scripts/backup/postgres.sh"

printf '%s Control revision: %s\n' "$log_prefix" "${ROLLBACK_CONTROL_REVISION:-current}"
printf '%s Preserved current deployment tools to %s\n' "$log_prefix" "$ROLLBACK_TOOLS_DIR"

# ── Fetch remote refs ────────────────────────────────────────────
printf '%s Fetching refs...\n' "$log_prefix"
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'

# ── Resolve target revision to exact commit ─────────────────────
TARGET_SHA="$(git rev-parse --verify "${TARGET_REVISION}^{commit}" 2>/dev/null || true)"
if [ -z "$TARGET_SHA" ]; then
  printf '%s ERROR: Could not resolve TARGET_REVISION=%s to a commit\n' "$log_prefix" "$TARGET_REVISION" >&2
  exit 1
fi

printf '%s Target revision: %s\n' "$log_prefix" "$TARGET_REVISION"
printf '%s Resolved commit:  %s\n' "$log_prefix" "$TARGET_SHA"

# ── Checkout target revision using a detached-head-style move ──
printf '%s Checking out %s...\n' "$log_prefix" "$TARGET_SHA"
git checkout -B develop "$TARGET_SHA"

VERIFIED_SHA="$(git rev-parse HEAD)"
if [ "$VERIFIED_SHA" != "$TARGET_SHA" ]; then
  printf '%s ERROR: Checkout failed — HEAD is %s, expected %s\n' "$log_prefix" "$VERIFIED_SHA" "$TARGET_SHA" >&2
  exit 1
fi

printf '%s Checkout confirmed: HEAD is %s\n' "$log_prefix" "$VERIFIED_SHA"

# ── Export rollback-specific env vars ───────────────────────────
export DEPLOY_TOOLS_DIR="$ROLLBACK_TOOLS_DIR"
export SKIP_DB_MIGRATIONS="true"
export GIT_COMMIT="$TARGET_SHA"

# ── Execute preserved current ssm-deploy.sh ─────────────────────
printf '%s Executing preserved deployment tools from %s\n' "$log_prefix" "$DEPLOY_TOOLS_DIR"
printf '%s SKIP_DB_MIGRATIONS=true — database schema will not be modified\n' "$log_prefix"

bash "$DEPLOY_TOOLS_DIR/scripts/deploy/ssm-deploy.sh"

printf '%s Rollback deployment completed successfully\n' "$log_prefix"
