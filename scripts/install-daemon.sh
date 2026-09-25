#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# SPanel daemon installer — standalone script that sets up the daemon on a
# Linux node with Docker, creates the spanel user, writes config.yml from the
# panel, and installs a systemd service.
#
# Usage:
#   curl -fsSL http://panel.example.com/install/daemon.sh | sudo bash -s -- \
#     --panel http://panel.example.com \
#     --token-id <id> --token <token> --port 8080
#
# Or run directly on the node:
#   sudo bash scripts/install-daemon.sh \
#     --panel http://panel.example.com \
#     --token-id <id> --token <token> --port 8080
# ---------------------------------------------------------------------------
set -euo pipefail

log()  { printf '\033[38;5;39m[spanel]\033[0m %s\n' "$*"; }
ok()   { printf '\033[38;5;41m  ok\033[0m   %s\n' "$*"; }
warn() { printf '\033[38;5;214m[spanel]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[38;5;203m  fail\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this script as root (use sudo)."

INSTALL_DIR="/opt/spanel-daemon"
CONFIG_PATH="/etc/spanel/config.yml"
SERVICE_NAME="spanel-daemon"
LOG_DIR="/var/log/spanel"

# ---- parse flags ----------------------------------------------------------
PANEL_URL=""
TOKEN_ID=""
TOKEN=""
PORT="8080"
DATA_DIR="/var/lib/spanel/volumes"
SKIP_DOCKER=false
SKIP_PACKAGES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --panel)         PANEL_URL="$2";   shift 2 ;;
    --token-id)      TOKEN_ID="$2";    shift 2 ;;
    --token)         TOKEN="$2";       shift 2 ;;
    --port)          PORT="$2";        shift 2 ;;
    --data)          DATA_DIR="$2";    shift 2 ;;
    --skip-docker)   SKIP_DOCKER=true; shift ;;
    --skip-packages) SKIP_PACKAGES=true; shift ;;
    *) warn "Ignoring unknown argument: $1"; shift ;;
  esac
done

[[ -n "$PANEL_URL" ]] || die "--panel is required."
[[ -n "$TOKEN_ID" ]]  || die "--token-id is required."
[[ -n "$TOKEN" ]]     || die "--token is required."

log "SPanel daemon installer"
log "Panel: $PANEL_URL  Port: $PORT  Data: $DATA_DIR"

# ---- packages -------------------------------------------------------------
if [[ "$SKIP_PACKAGES" != true ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    log "Installing base packages (apt)…"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y curl ca-certificates gnupg git tar unzip nginx certbot python3-certbot-nginx >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    log "Installing base packages (dnf)…"
    dnf install -y curl ca-certificates gnupg2 git tar unzip nginx certbot python3-certbot-nginx >/dev/null 2>&1 || true
  else
    warn "No package manager found. Install curl, git, tar, nginx and certbot yourself."
  fi
  ok "Base packages."
fi

# ---- docker ---------------------------------------------------------------
if [[ "$SKIP_DOCKER" != true ]]; then
  if command -v docker >/dev/null 2>&1; then
    ok "Docker already installed ($(docker --version))."
  else
    log "Installing Docker…"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker 2>/dev/null || true
fi

# ---- node.js --------------------------------------------------------------
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi
if (( NODE_MAJOR < 20 )); then
  log "Installing Node.js 22…"
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    dnf install -y nodejs >/dev/null 2>&1
  else
    die "Install Node.js 20+ manually."
  fi
fi
ok "Node.js $(node -v)."

# ---- spanel user ----------------------------------------------------------
if ! id -u spanel >/dev/null 2>&1; then
  log "Creating spanel system user…"
  useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/spanel spanel || true
fi
usermod -aG docker spanel 2>/dev/null || true

# ---- directories ----------------------------------------------------------
for d in "$DATA_DIR" "$DATA_DIR/.archives" "$DATA_DIR/.backups" "/etc/spanel/vhosts" "$LOG_DIR" "$INSTALL_DIR" "/tmp/spanel"; do
  mkdir -p "$d"
done
chown -R spanel:spanel "$DATA_DIR" "$LOG_DIR" 2>/dev/null || true
chmod 750 /etc/spanel 2>/dev/null || true
ok "Directories ready."

# ---- nginx include --------------------------------------------------------
if [[ -d /etc/nginx/conf.d ]] && [[ ! -f /etc/nginx/conf.d/spanel.conf ]]; then
  echo 'include /etc/spanel/vhosts/*.conf;' > /etc/nginx/conf.d/spanel.conf
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  ok "nginx wired to SPanel vhosts."
fi

# ---- daemon source --------------------------------------------------------
if [[ -f "$INSTALL_DIR/package.json" ]]; then
  ok "Daemon source already present in $INSTALL_DIR."
else
  warn "No daemon source in $INSTALL_DIR."
  warn "Copy apps/daemon into $INSTALL_DIR, then run:"
  warn "  cd $INSTALL_DIR && npm install --omit=dev && npm run build"
fi

if [[ -f "$INSTALL_DIR/package.json" ]]; then
  log "Installing daemon dependencies…"
  cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund 2>/dev/null || true
  log "Building the daemon…"
  npm run build 2>/dev/null || warn "Build failed — run 'npm run build' manually."
fi

# ---- config.yml -----------------------------------------------------------
log "Fetching configuration from the panel…"
SIG=$(echo -n '' | openssl dgst -sha256 -hmac "$TOKEN" -hex 2>/dev/null | awk '{print $NF}')
HTTP_CODE=$(curl -s -o /tmp/spanel-config-response.json -w '%{http_code}' \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ${TOKEN_ID}.${TOKEN}" \
  -H "X-Spanel-Signature: ${SIG}" \
  "${PANEL_URL}/api/remote/nodes/config" 2>/dev/null || echo 0)

if [[ "$HTTP_CODE" == "200" ]]; then
  CONFIG=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/spanel-config-response.json','utf8')).config||'')" 2>/dev/null || echo '')
  if [[ -n "$CONFIG" ]]; then
    echo "$CONFIG" > "$CONFIG_PATH"
    chmod 640 "$CONFIG_PATH"
    chgrp spanel "$CONFIG_PATH" 2>/dev/null || true
    ok "Configuration written to $CONFIG_PATH."
  else
    warn "Panel returned empty config; writing local fallback."
  fi
else
  warn "Panel returned HTTP $HTTP_CODE; writing local fallback config."
fi

if [[ ! -s "$CONFIG_PATH" ]]; then
  cat > "$CONFIG_PATH" << CFGEOF
debug: false

api:
  host: 0.0.0.0
  port: ${PORT}
  ssl:
    enabled: false
    cert: ""
    key: ""
  upload_limit: 256

system:
  data: ${DATA_DIR}
  archive_directory: ${DATA_DIR}/.archives
  backup_directory: ${DATA_DIR}/.backups
  tmp_directory: /tmp/spanel
  username: spanel
  timezone: UTC
  sftp:
    bind_port: 2022

docker:
  network:
    name: spanel0
    driver: bridge
    interface: 172.19.0.1
    dns:
      - 1.1.1.1
      - 8.8.8.8
  install_limit: 5

proxy:
  enabled: true
  http_port: 80
  https_port: 443
  acme_email: ""
  config_directory: /etc/spanel/vhosts
  reload_command: nginx -s reload

remote: ${PANEL_URL}
token_id: ${TOKEN_ID}
token: ${TOKEN}
CFGEOF
  chmod 640 "$CONFIG_PATH"
  chgrp spanel "$CONFIG_PATH" 2>/dev/null || true
  ok "Fallback configuration written to $CONFIG_PATH."
fi
rm -f /tmp/spanel-config-response.json

# ---- systemd --------------------------------------------------------------
NODE_BIN="$(command -v node)"
ENTRYPOINT="$INSTALL_DIR/dist/index.js"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log "Installing systemd service…"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=SPanel Daemon
Documentation=https://spanel.sadlystudios.bond
After=network-online.target docker.service
Requires=docker.service

[Service]
User=spanel
Group=spanel
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_BIN} ${ENTRYPOINT} --config ${CONFIG_PATH}
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/daemon.log
StandardError=append:${LOG_DIR}/daemon.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
ok "Service installed: $SERVICE_FILE"

# ---- start ----------------------------------------------------------------
if [[ -f "$ENTRYPOINT" ]]; then
  systemctl restart "$SERVICE_NAME" || true
  sleep 2
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Daemon is running on port $PORT."
  else
    warn "Daemon did not start. Check: journalctl -u $SERVICE_NAME -n 80 --no-pager"
  fi
else
  warn "$ENTRYPOINT not found — build the daemon first, then: sudo systemctl start $SERVICE_NAME"
fi

log "Done."
echo ""
echo "  Service:   sudo systemctl status $SERVICE_NAME"
echo "  Restart:   sudo systemctl restart $SERVICE_NAME"
echo "  Stop:      sudo systemctl stop $SERVICE_NAME"
echo "  Logs:      journalctl -u $SERVICE_NAME -f"
echo "  Doctor:    sudo node $INSTALL_DIR/dist/cli.js doctor"
echo "  Firewall:  open TCP $PORT plus your game/web ports"
echo ""
