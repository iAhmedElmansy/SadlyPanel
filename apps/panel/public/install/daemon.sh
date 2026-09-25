#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# SPanel daemon bootstrap.
#
# This script only guarantees that curl and Node.js 20+ exist, then hands over
# to the real installer, which is written in Node.js (install/daemon.mjs).
# Everything else — Docker, the spanel user, directories, the daemon build, the
# configuration and the systemd unit — is done there.
#
# Usage (copy the exact command from Admin -> Nodes -> your node):
#   curl -fsSL https://panel.example.com/install/daemon.sh | sudo bash -s -- \
#     --panel https://panel.example.com \
#     --token-id abcdef1234567890 \
#     --token <node-token> \
#     --port 8080
#
# Any additional flags are forwarded verbatim, e.g.
#   --repo <git-url> | --tarball <url> | --data <dir> | --skip-docker
# ---------------------------------------------------------------------------
set -euo pipefail

log()  { printf '\033[38;5;39m[spanel]\033[0m %s\n' "$*"; }
warn() { printf '\033[38;5;214m[spanel]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[38;5;203m[spanel]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this script as root (use sudo)."

PANEL_URL=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel) PANEL_URL="$2"; ARGS+=("$1" "$2"); shift 2 ;;
    --*)
      if [[ $# -ge 2 && "$2" != --* ]]; then
        ARGS+=("$1" "$2"); shift 2
      else
        ARGS+=("$1"); shift
      fi
      ;;
    *) die "Unexpected argument: $1" ;;
  esac
done

[[ -n "$PANEL_URL" ]] || die "--panel is required."

# --- curl ------------------------------------------------------------------
if ! command -v curl >/dev/null 2>&1; then
  log "Installing curl…"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y curl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates
  else
    die "Install curl manually, then re-run this script."
  fi
fi

# --- node.js ---------------------------------------------------------------
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if (( NODE_MAJOR < 20 )); then
  log "Installing Node.js 22…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
  else
    die "Install Node.js 20 or newer manually, then re-run this script."
  fi
else
  log "Node.js $(node -v) already installed."
fi

# --- hand over to the Node installer --------------------------------------
INSTALLER="$(mktemp /tmp/spanel-install-XXXXXX.mjs)"
trap 'rm -f "$INSTALLER"' EXIT

log "Fetching the Node.js installer from ${PANEL_URL}/install/daemon.mjs…"
curl -fsSL "${PANEL_URL}/install/daemon.mjs" -o "$INSTALLER" \
  || die "Unable to download ${PANEL_URL}/install/daemon.mjs"

log "Running the installer…"
exec node "$INSTALLER" "${ARGS[@]}"
