#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:?APP_URL is required}"
API_URL="${API_URL:?API_URL is required}"
SMOKE_EXPECT_ENV="${SMOKE_EXPECT_ENV:-}"
SMOKE_API_BASE_PATH="${SMOKE_API_BASE_PATH:-${API_BASE_PATH:-/api}}"
SMOKE_HEALTH_PATH="${SMOKE_HEALTH_PATH:-${API_HEALTH_PATH:-/api/health}}"
SMOKE_READY_PATH="${SMOKE_READY_PATH:-${SMOKE_API_BASE_PATH%/}/ready}"
SMOKE_VERSION_PATH="${SMOKE_VERSION_PATH:-${API_VERSION_PATH:-/api/version}}"

app_root="${APP_URL%/}"
api_input="${API_URL%/}"

case "$api_input" in
  */health) api_root="${api_input%/health}" ;;
  */ready) api_root="${api_input%/ready}" ;;
  */version) api_root="${api_input%/version}" ;;
  *) api_root="$api_input" ;;
esac

health_suffix="$SMOKE_HEALTH_PATH"
ready_suffix="$SMOKE_READY_PATH"
version_suffix="$SMOKE_VERSION_PATH"

if [ -n "$SMOKE_API_BASE_PATH" ] && [ "$SMOKE_API_BASE_PATH" != "/" ]; then
  health_suffix="${health_suffix#"$SMOKE_API_BASE_PATH"}"
  ready_suffix="${ready_suffix#"$SMOKE_API_BASE_PATH"}"
  version_suffix="${version_suffix#"$SMOKE_API_BASE_PATH"}"
fi

health_suffix="/${health_suffix#/}"
ready_suffix="/${ready_suffix#/}"
version_suffix="/${version_suffix#/}"

fetch() {
  curl --fail --show-error --silent --location "$1"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"

  if ! printf '%s' "$haystack" | grep -F "$needle" >/dev/null; then
    printf 'Expected to find "%s" in response but did not.\n' "$needle" >&2
    exit 1
  fi
}

assert_matches() {
  local haystack="$1"
  local pattern="$2"

  if ! printf '%s' "$haystack" | grep -E "$pattern" >/dev/null; then
    printf 'Expected response to match /%s/ but it did not.\n' "$pattern" >&2
    exit 1
  fi
}

printf '[SMOKE] Checking %s...\n' "$app_root/"
home_html="$(fetch "$app_root/")"
printf '[SMOKE] Checking %s...\n' "$app_root/login"
login_html="$(fetch "$app_root/login")"
printf '[SMOKE] Checking %s...\n' "$app_root/app"
app_html="$(fetch "$app_root/app")"
printf '[SMOKE] Checking %s...\n' "$app_root/enterprise"
enterprise_html="$(fetch "$app_root/enterprise")"
printf '[SMOKE] Checking %s...\n' "$api_root$health_suffix"
health_json="$(fetch "$api_root$health_suffix")"
printf '[SMOKE] Checking %s...\n' "$api_root$ready_suffix"
ready_json="$(fetch "$api_root$ready_suffix")"
printf '[SMOKE] Checking %s...\n' "$api_root$version_suffix"
version_json="$(fetch "$api_root$version_suffix")"

assert_contains "$home_html" 'Balance'
assert_contains "$home_html" 'Balance workspace'
assert_contains "$home_html" 'Textract-first'
assert_contains "$home_html" 'Enter workspace'
assert_contains "$login_html" 'Sign in'
assert_contains "$login_html" 'Email'
assert_contains "$app_html" 'Loading'
assert_contains "$enterprise_html" 'Loading'

assert_matches "$health_json" '"status"[[:space:]]*:[[:space:]]*"ok"'
assert_matches "$health_json" '"service"[[:space:]]*:[[:space:]]*"balance-api"'
assert_matches "$health_json" '"app"[[:space:]]*:[[:space:]]*"Balance"'
assert_matches "$health_json" '"version"[[:space:]]*:[[:space:]]*"'

if [ -n "$SMOKE_EXPECT_ENV" ]; then
  assert_matches "$health_json" "\"environment\"[[:space:]]*:[[:space:]]*\"$SMOKE_EXPECT_ENV\""
fi

assert_matches "$ready_json" '"status"[[:space:]]*:[[:space:]]*"ready"'
assert_matches "$version_json" '"service"[[:space:]]*:[[:space:]]*"balance-api"'
assert_matches "$version_json" '"app"[[:space:]]*:[[:space:]]*"Balance"'
assert_matches "$version_json" '"version"[[:space:]]*:[[:space:]]*"'
assert_matches "$version_json" '"commit"[[:space:]]*:[[:space:]]*"'
assert_matches "$version_json" '"build"[[:space:]]*:[[:space:]]*"'

printf 'Smoke checks passed for %s and %s\n' "$app_root" "$api_root"
