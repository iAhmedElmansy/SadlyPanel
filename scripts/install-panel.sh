#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# SPanel panel installer — interactive, Pterodactyl-style.
#
# Handles:
#   - Node.js 22 installation
#   - npm install + prisma + build
#   - .env configuration (asks for domain/IP, HTTPS, port)
#   - Let's Encrypt certificate via certbot (optional)
#   - nginx reverse proxy (domain → localhost:PORT)
#   - systemd service
#
# Usage:
#   sudo bash scripts/install-panel.sh
# ---------------------------------------------------------------------------
set -euo pipefail

log()  { printf '\033[38;5;39m[spanel]\033[0m %s\n' "$*"; }
warn() { printf '\033[38;5;214m[spanel]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[38;5;41m  ok\033[0m   %s\n' "$*"; }
die()  { printf '\033[38;5;203m  fail\033[0m %s\n' "$*" >&2; exit 1; }

ask() {
  local prompt="$1" default="${2:-}" result
  if [[ -n "$default" ]]; then
    read -rp "$(printf '\033[38;5;39m[?]\033[0m %s [%s]: ' "$prompt" "$default")" result
    echo "${result:-$default}"
  else
    read -rp "$(printf '\033[38;5;39m[?]\033[0m %s: ' "$prompt")" result
    echo "$result"
  fi
}

ask_yn() {
  local prompt="$1" default="${2:-y}"
  local result
  read -rp "$(printf '\033[38;5;39m[?]\033[0m %s [%s]: ' "$prompt" "$default")" result
  result="${result:-$default}"
  [[ "${result,,}" == "y" || "${result,,}" == "yes" ]]
}

[[ $EUID -eq 0 ]] || die "Run this script as root (use sudo)."

echo ""
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║        SPanel — Panel Installer                ║"
echo "  ╚════════════════════════════════════════════════╝"
echo ""

# ---- gather info -----------------------------------------------------------
PANEL_DIR=$(ask "Panel directory" "/var/www/SPanel")

if [[ ! -d "$PANEL_DIR" ]]; then
  die "Directory $PANEL_DIR does not exist. Clone the repository first:\n  git clone <repo> $PANEL_DIR"
fi

FQDN=$(ask "Domain or IP for the panel" "$(hostname -f)")
USE_SSL=false
if [[ "$FQDN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  log "IP address detected — skipping HTTPS."
else
  if ask_yn "Enable HTTPS with Let's Encrypt for $FQDN?" "y"; then
    USE_SSL=true
    SSL_EMAIL=$(ask "Email for Let's Encrypt" "admin@${FQDN#*.}")
  fi
fi

PANEL_PORT=$(ask "Panel port (Next.js listens here, nginx proxies to it)" "3110")
DB_TYPE=$(ask "Database path (SQLite file)" "file:./prod.db")

if [[ "$USE_SSL" == true ]]; then
  APP_URL="https://$FQDN"
else
  if [[ "$FQDN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    APP_URL="http://$FQDN:$PANEL_PORT"
  else
    APP_URL="http://$FQDN"
  fi
fi

echo ""
log "Configuration summary:"
echo "  Directory:  $PANEL_DIR"
echo "  FQDN/IP:   $FQDN"
echo "  HTTPS:     $USE_SSL"
echo "  Port:      $PANEL_PORT"
echo "  APP_URL:   $APP_URL"
echo "  Database:  $DB_TYPE"
echo ""

if ! ask_yn "Proceed with installation?" "y"; then
  die "Installation cancelled."
fi

# ---- node.js ---------------------------------------------------------------
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
fi

if (( NODE_MAJOR < 20 )); then
  log "Installing Node.js 22…"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
  else
    die "Install Node.js 20 or newer manually."
  fi
  ok "Node.js installed."
else
  ok "Node.js $(node -v) already present."
fi

# ---- dependencies ----------------------------------------------------------
cd "$PANEL_DIR"
log "Installing npm dependencies…"
npm install --no-audit --no-fund 2>/dev/null || npm install
ok "Dependencies installed."

# ---- .env ------------------------------------------------------------------
ENV_FILE="$PANEL_DIR/apps/panel/.env"
APP_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  # Preserve existing APP_KEY
  APP_KEY=$(grep '^APP_KEY=' "$ENV_FILE" | cut -d'=' -f2- || true)
fi
if [[ -z "$APP_KEY" ]]; then
  APP_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")"
fi

cat > "$ENV_FILE" << EOF
NODE_ENV=production
APP_URL=$APP_URL
APP_NAME=SPanel
APP_KEY=$APP_KEY
DATABASE_URL="$DB_TYPE"
SESSION_COOKIE=spanel_session
SESSION_TTL_DAYS=14
TRUST_PROXY=true
OPEN_REGISTRATION=false
UPLOAD_DIR=public/uploads
EOF
ok "Created $ENV_FILE"

# Source .env
set -a; source "$ENV_FILE" 2>/dev/null; set +a
export DATABASE_URL="${DATABASE_URL:-$DB_TYPE}"

# ---- prisma ----------------------------------------------------------------
log "Running database migrations…"
npx prisma db push --schema apps/panel/prisma/schema.prisma --accept-data-loss 2>/dev/null || \
  warn "Prisma migration failed — run it manually."
ok "Database ready."

# ---- build -----------------------------------------------------------------
log "Building the panel (this may take a minute)…"
NODE_ENV=production npm run build --workspace @spanel/panel || \
  die "Panel build failed. Fix the error above and re-run."
ok "Panel built successfully."

# ---- nginx -----------------------------------------------------------------
if command -v nginx >/dev/null 2>&1; then
  log "Configuring nginx reverse proxy…"
  
  if [[ ! -d /etc/nginx/sites-available ]]; then
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  fi

  NGINX_CONF="/etc/nginx/sites-available/spanel-panel.conf"
  
  cat > "$NGINX_CONF" << NGINXEOF
server {
    listen 80;
    server_name $FQDN;

    location / {
        proxy_pass http://127.0.0.1:$PANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
NGINXEOF

  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/spanel-panel.conf
  
  # Remove default if it conflicts
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
  fi

  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    ok "nginx configured: $FQDN → localhost:$PANEL_PORT"
  else
    warn "nginx config test failed — check /etc/nginx/sites-available/spanel-panel.conf"
  fi
else
  warn "nginx not found. Install it for domain-based access without :port"
fi

# ---- certbot ---------------------------------------------------------------
if [[ "$USE_SSL" == true ]]; then
  log "Requesting Let's Encrypt certificate…"
  
  if ! command -v certbot >/dev/null 2>&1; then
    log "Installing certbot…"
    apt-get install -y certbot python3-certbot-nginx 2>/dev/null || \
      dnf install -y certbot python3-certbot-nginx 2>/dev/null || \
      warn "Could not install certbot automatically."
  fi

  if command -v certbot >/dev/null 2>&1; then
    certbot --nginx -d "$FQDN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect || \
      warn "Certbot failed. Run manually: certbot --nginx -d $FQDN"
    ok "SSL certificate installed for $FQDN."
  fi
fi

# ---- systemd ---------------------------------------------------------------
NODE_BIN="$(command -v node)"
SERVICE_NAME="spanel-panel"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Find the next binary
NEXT_BIN=""
for candidate in \
  "$PANEL_DIR/node_modules/.bin/next" \
  "$PANEL_DIR/apps/panel/node_modules/.bin/next"; do
  if [[ -x "$candidate" ]]; then
    NEXT_BIN="$candidate"
    break
  fi
done
[[ -n "$NEXT_BIN" ]] || die "Cannot find the 'next' binary in node_modules."

log "Installing the systemd service…"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=SPanel Panel (Next.js)
Documentation=https://spanel.sadlystudios.bond
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PANEL_DIR}/apps/panel
EnvironmentFile=${ENV_FILE}
Environment=PORT=${PANEL_PORT}
ExecStart=${NODE_BIN} ${NEXT_BIN} start -p ${PANEL_PORT}
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:/var/log/spanel/panel.log
StandardError=append:/var/log/spanel/panel.log

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /var/log/spanel
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
ok "Service installed: $SERVICE_FILE"

# ---- start -----------------------------------------------------------------
systemctl restart "$SERVICE_NAME" || warn "Could not start the panel service."
sleep 3
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Panel is running!"
else
  warn "Panel did not start. Check: journalctl -u $SERVICE_NAME -n 80 --no-pager"
fi

# ---- done ------------------------------------------------------------------
echo ""
echo "  ╔════════════════════════════════════════════════╗"
echo "  ║        Installation complete!                  ║"
echo "  ╚════════════════════════════════════════════════╝"
echo ""
if [[ "$USE_SSL" == true ]]; then
  echo "  Panel URL:   https://$FQDN"
else
  echo "  Panel URL:   $APP_URL"
fi
echo ""
echo "  Commands:"
echo "    sudo systemctl status $SERVICE_NAME"
echo "    sudo systemctl restart $SERVICE_NAME"
echo "    sudo systemctl stop $SERVICE_NAME"
echo "    journalctl -u $SERVICE_NAME -f"
echo ""
echo "  Config:   $ENV_FILE"
echo "  Logs:     /var/log/spanel/panel.log"
if [[ "$USE_SSL" == true ]]; then
  echo "  SSL:      certbot renew (auto via cron/timer)"
fi
echo ""
