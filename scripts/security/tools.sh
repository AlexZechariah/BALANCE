#!/usr/bin/env bash

resolve_tool() {
  local name="$1"
  shift

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  local candidate
  for candidate in "$@"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

winget_osv_path() {
  local local_app_data="${LOCALAPPDATA:-}"
  if [ -z "$local_app_data" ] && command -v cmd.exe >/dev/null 2>&1; then
    local_app_data="$(cmd.exe /c 'echo %LOCALAPPDATA%' 2>/dev/null | tr -d '\r' | sed -n '1p')"
  fi

  if [ -z "$local_app_data" ]; then
    return 1
  fi

  if command -v cygpath >/dev/null 2>&1; then
    local_app_data="$(cygpath -u "$local_app_data")"
  elif command -v wslpath >/dev/null 2>&1; then
    local_app_data="$(wslpath -u "$local_app_data")"
  fi

  local candidate="$local_app_data/Microsoft/WinGet/Packages/Google.OSVScanner_Microsoft.Winget.Source_8wekyb3d8bbwe/osv-scanner.exe"
  if [ -x "$candidate" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}
