#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# SPanel Installer — unified interactive installer for Panel and Daemon.
#
# Usage:  sudo bash scripts/install.sh
# ---------------------------------------------------------------------------
set -euo pipefail

# ---- colours + helpers ----------------------------------------------------
C_RESET="\033[0m"
C_BLUE="\033[38;5;39m"
C_GREEN="\033[38;5;41m"
C_AMBER="\033[38;5;214m"
C_RED="\033[38;5;203m"
C_DIM="\033[38;5;244m"
C_BOLD="\033[1m"

log()  { printf "${C_BLUE}[spanel]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET}  %s\n" "$*"; }
warn() { printf "${C_AMBER}  !${C_RESET}  %s\n" "$*" >&2; }
fail() { printf "${C_RED}  ✗${C_RESET}  %s\n" "$*" >&2; }
die()  { fail "$*"; exit 1; }

ask() {
  local prompt="$1" default="${2:-}" result
  if [[ -n "$default" ]]; then
    read -rp "$(printf "${C_BLUE}[?]${C_RESET} %s [%s]: " "$prompt" "$default")" result </dev/tty
    echo "${result:-$default}"
  else
    read -rp "$(printf "${C_BLUE}[?]${C_RESET} %s: " "$prompt")" result </dev/tty
    echo "$result"
  fi
}

ask_yn() {
  local prompt="$1" default="${2:-y}" result
  read -rp "$(printf "${C_BLUE}[?]${C_RESET} %s [%s]: " "$prompt" "$default")" result </dev/tty
  result="${result:-$default}"
  [[ "${result,,}" == "y" || "${result,,}" == "yes" ]]
}

menu() {
  local title="$1"; shift
  local options=("$@")
  echo "" >&2
  printf "  ${C_BOLD}%s${C_RESET}\n" "$title" >&2
  echo "" >&2
  for i in "${!options[@]}"; do
    printf "    ${C_GREEN}%d)${C_RESET} %s\n" "$((i+1))" "${options[$i]}" >&2
  done
  echo "" >&2
  local choice
  read -rp "$(printf "${C_BLUE}[?]${C_RESET} Enter your choice: ")" choice </dev/tty
  echo "$choice"
}

banner() {
  echo ""
  echo -e "  ${C_BLUE}╔════════════════════════════════════════════════╗${C_RESET}"
  echo -e "  ${C_BLUE}║${C_RESET}     ${C_BOLD}SPanel${C_RESET} — Unified Installer              ${C_BLUE}║${C_RESET}"
  echo -e "  ${C_BLUE}╚════════════════════════════════════════════════╝${C_RESET}"
  echo ""
}

[[ $EUID -eq 0 ]] || die "Run this script as root (use sudo)."

# ---- detect installed components ------------------------------------------
PANEL_INSTALLED=false
DAEMON_INSTALLED=false
[[ -f /etc/systemd/system/spanel-panel.service ]] && PANEL_INSTALLED=true
[[ -f /etc/systemd/system/spanel-daemon.service ]] && DAEMON_INSTALLED=true

# ===========================================================================
# Common: Node.js
# ===========================================================================
ensure_nodejs() {
  local NODE_MAJOR=0
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
      die "Install Node.js 20+ manually."
    fi
    ok "Node.js installed."
  else
    ok "Node.js $(node -v)"
  fi
}

ensure_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Installing nginx…"
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y nginx >/dev/null 2>&1
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y nginx >/dev/null 2>&1
    fi
  fi
  systemctl enable --now nginx 2>/dev/null || true
  ok "nginx ready."
}

# ===========================================================================
# PANEL INSTALL
# ===========================================================================
install_panel() {
  banner
  log "Panel Installation"
  echo ""

  local PANEL_DIR="${SPANEL_DIR:-$(ask "Panel directory" "/var/www/SPanel")}"
  [[ -d "$PANEL_DIR" ]] || die "$PANEL_DIR does not exist. Clone the repo first."

  local FQDN=$(ask "Domain or IP for the panel" "$(hostname -f)")
  local USE_SSL=false
  local SSL_EMAIL=""
  if [[ ! "$FQDN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if ask_yn "Enable HTTPS with Let's Encrypt for $FQDN?" "y"; then
      USE_SSL=true
      SSL_EMAIL=$(ask "Email for Let's Encrypt" "admin@${FQDN#*.}")
    fi
  else
    log "IP address detected — HTTPS skipped."
  fi

  local PANEL_PORT=$(ask "Internal panel port" "3110")

  local APP_URL
  if [[ "$USE_SSL" == true ]]; then
    APP_URL="https://$FQDN"
  elif [[ "$FQDN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    APP_URL="http://$FQDN:$PANEL_PORT"
  else
    APP_URL="http://$FQDN"
  fi

  echo ""
  echo -e "  ${C_DIM}Directory:${C_RESET}  $PANEL_DIR"
  echo -e "  ${C_DIM}FQDN/IP:${C_RESET}    $FQDN"
  echo -e "  ${C_DIM}HTTPS:${C_RESET}      $USE_SSL"
  echo -e "  ${C_DIM}Port:${C_RESET}       $PANEL_PORT"
  echo -e "  ${C_DIM}APP_URL:${C_RESET}    $APP_URL"
  echo ""
  ask_yn "Proceed?" "y" || return

  ensure_nodejs

  # npm install
  cd "$PANEL_DIR"
  log "Installing dependencies…"
  npm install --no-audit --no-fund 2>/dev/null || npm install
  ok "Dependencies installed."

  # .env
  local ENV_FILE="$PANEL_DIR/apps/panel/.env"
  local APP_KEY=""
  [[ -f "$ENV_FILE" ]] && APP_KEY=$(grep '^APP_KEY=' "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- || true)
  [[ -z "$APP_KEY" ]] && APP_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")"

  cat > "$ENV_FILE" << ENVEOF
NODE_ENV=production
APP_URL=$APP_URL
APP_NAME=SPanel
APP_KEY=$APP_KEY
DATABASE_URL="file:./prod.db"
SESSION_COOKIE=spanel_session
SESSION_TTL_DAYS=14
TRUST_PROXY=true
OPEN_REGISTRATION=false
UPLOAD_DIR=public/uploads
ENVEOF
  ok "Created $ENV_FILE"
  set -a; source "$ENV_FILE" 2>/dev/null; set +a

  # prisma
  log "Running database migrations…"
  npx prisma db push --schema apps/panel/prisma/schema.prisma --accept-data-loss 2>/dev/null || \
    warn "Prisma failed — run manually."
  ok "Database ready."

  # seed
  log "Seeding the database…"
  cd "$PANEL_DIR/apps/panel"
  npx prisma db seed 2>/dev/null || npx tsx prisma/seed.ts 2>/dev/null || \
    warn "Seed failed or already seeded — skipping."
  cd "$PANEL_DIR"
  ok "Database seeded."

  # build
  log "Building the panel…"
  # Drop any stale compiled output first — a leftover .next from an earlier
  # (older) checkout is what makes a re-install keep serving the old pages.
  rm -rf "$PANEL_DIR/apps/panel/.next"
  NODE_ENV=production npm run build --workspace @sadlystudios-panel/panel || \
    die "Build failed."
  ok "Panel built."

  # nginx
  ensure_nginx
  local NGINX_CONF="/etc/nginx/sites-available/spanel-panel.conf"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

  cat > "$NGINX_CONF" << 'NGEOF'
server {
    listen 80;
    server_name FQDN_PLACEHOLDER;

    client_max_body_size 256m;

    location / {
        proxy_pass http://127.0.0.1:PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
NGEOF
  sed -i "s/FQDN_PLACEHOLDER/$FQDN/g" "$NGINX_CONF"
  sed -i "s/PORT_PLACEHOLDER/$PANEL_PORT/g" "$NGINX_CONF"
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/spanel-panel.conf
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t 2>/dev/null && systemctl reload nginx
  ok "nginx: $FQDN → localhost:$PANEL_PORT"

  # certbot
  if [[ "$USE_SSL" == true ]]; then
    log "Requesting SSL certificate…"
    command -v certbot >/dev/null 2>&1 || \
      apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
    certbot --nginx -d "$FQDN" --non-interactive --agree-tos --email "$SSL_EMAIL" --redirect || \
      warn "Certbot failed. Run: certbot --nginx -d $FQDN"
    ok "SSL certificate installed."
  fi

  # systemd
  local NODE_BIN="$(command -v node)"
  local NEXT_BIN=""
  for c in "$PANEL_DIR/node_modules/.bin/next" "$PANEL_DIR/apps/panel/node_modules/.bin/next"; do
    [[ -x "$c" ]] && NEXT_BIN="$c" && break
  done
  [[ -n "$NEXT_BIN" ]] || die "Cannot find next binary."

  cat > /etc/systemd/system/spanel-panel.service << SVCEOF
[Unit]
Description=SPanel Panel (Next.js)
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
SVCEOF

  mkdir -p /var/log/spanel
  systemctl daemon-reload
  systemctl enable spanel-panel
  systemctl restart spanel-panel
  sleep 3
  if systemctl is-active --quiet spanel-panel; then
    ok "Panel is running!"
  else
    warn "Panel did not start. Check: journalctl -u spanel-panel -n 40"
  fi

  echo ""
  echo -e "  ${C_GREEN}Panel installed successfully!${C_RESET}"
  echo -e "  URL: ${C_BOLD}$APP_URL${C_RESET}"
  echo ""
}

# ===========================================================================
# DAEMON INSTALL
# ===========================================================================
install_daemon() {
  banner
  log "Daemon Installation"
  echo ""

  local PANEL_DIR="${SPANEL_DIR:-$(ask "SPanel project directory" "/var/www/SPanel")}"
  [[ -d "$PANEL_DIR/apps/daemon" ]] || die "$PANEL_DIR/apps/daemon not found."

  local PANEL_URL=$(ask "Panel URL (how the daemon reaches the panel)" "http://localhost:3110")

  local DAEMON_FQDN=$(ask "Daemon FQDN or IP (how the browser/panel reaches this node)" "$(hostname -f)")
  local DAEMON_USE_SSL=false
  local DAEMON_SSL_EMAIL=""
  if [[ ! "$DAEMON_FQDN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if ask_yn "Enable HTTPS with Let's Encrypt for the daemon ($DAEMON_FQDN)?" "y"; then
      DAEMON_USE_SSL=true
      DAEMON_SSL_EMAIL=$(ask "Email for Let's Encrypt" "admin@${DAEMON_FQDN#*.}")
    fi
  else
    log "IP address detected — daemon HTTPS skipped."
  fi

  local TOKEN_ID=$(ask "Node token ID (from Admin -> Nodes)" "")
  [[ -n "$TOKEN_ID" ]] || die "Token ID is required."
  local TOKEN=$(ask "Node token" "")
  [[ -n "$TOKEN" ]] || die "Token is required."
  local DAEMON_PORT=$(ask "Daemon port" "8282")

  local DAEMON_SCHEME="http"
  [[ "$DAEMON_USE_SSL" == true ]] && DAEMON_SCHEME="https"

  echo ""
  echo -e "  ${C_DIM}Panel URL:${C_RESET}     $PANEL_URL"
  echo -e "  ${C_DIM}Daemon FQDN:${C_RESET}   $DAEMON_FQDN"
  echo -e "  ${C_DIM}Daemon HTTPS:${C_RESET}  $DAEMON_USE_SSL"
  echo -e "  ${C_DIM}Token ID:${C_RESET}      $TOKEN_ID"
  echo -e "  ${C_DIM}Port:${C_RESET}          $DAEMON_PORT"
  echo ""
  ask_yn "Proceed?" "y" || return

  ensure_nodejs

  # docker
  if command -v docker >/dev/null 2>&1; then
    ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"
  else
    log "Installing Docker…"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker 2>/dev/null || true

  # spanel user
  if ! id -u spanel >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin --home-dir /var/lib/spanel spanel 2>/dev/null || true
  fi
  usermod -aG docker spanel 2>/dev/null || true

  # directories
  local DATA_DIR="/var/lib/spanel/volumes"
  for d in "$DATA_DIR" "$DATA_DIR/.archives" "$DATA_DIR/.backups" "/etc/spanel/vhosts" "/var/log/spanel" "/tmp/spanel"; do
    mkdir -p "$d"
  done
  chown -R spanel:spanel "$DATA_DIR" /var/log/spanel 2>/dev/null || true
  ok "Directories ready."

  # symlink daemon
  if [[ ! -e /opt/spanel-daemon ]]; then
    ln -sf "$PANEL_DIR/apps/daemon" /opt/spanel-daemon
    ok "Linked /opt/spanel-daemon → $PANEL_DIR/apps/daemon"
  fi

  # install deps + build
  cd "$PANEL_DIR"
  log "Building the daemon…"
  npm install --no-audit --no-fund 2>/dev/null || npm install
  npm run build --workspace @sadlystudios-daemon/daemon || die "Daemon build failed."
  ok "Daemon built."

  # fetch config from panel
  log "Fetching configuration from the panel…"
  local SIG=$(echo -n '' | openssl dgst -sha256 -hmac "$TOKEN" -hex 2>/dev/null | awk '{print $NF}')
  local HTTP_CODE
  HTTP_CODE=$(curl -s -o /tmp/spanel-config-response.json -w '%{http_code}' \
    -H "Accept: application/json" \
    -H "Authorization: Bearer ${TOKEN_ID}.${TOKEN}" \
    -H "X-Spanel-Signature: ${SIG}" \
    "${PANEL_URL}/api/remote/nodes/config" 2>/dev/null || echo 0)

  local CONFIG_PATH="/etc/spanel/config.yml"
  if [[ "$HTTP_CODE" == "200" ]]; then
    local CONFIG
    CONFIG=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/spanel-config-response.json','utf8')).config||'')" 2>/dev/null || echo '')
    if [[ -n "$CONFIG" ]]; then
      echo "$CONFIG" > "$CONFIG_PATH"
      ok "Config fetched from panel."
    else
      warn "Empty config from panel; writing fallback."
    fi
  else
    warn "Panel returned HTTP $HTTP_CODE; writing fallback config."
  fi
  rm -f /tmp/spanel-config-response.json

  if [[ ! -s "$CONFIG_PATH" ]]; then
    cat > "$CONFIG_PATH" << CFGEOF
debug: false

api:
  host: 0.0.0.0
  port: ${DAEMON_PORT}
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
    ok "Fallback config written."
  fi

  chmod 640 "$CONFIG_PATH"
  chgrp spanel "$CONFIG_PATH" 2>/dev/null || true

  # nginx for vhosts
  ensure_nginx
  if [[ -d /etc/nginx/conf.d ]] && [[ ! -f /etc/nginx/conf.d/spanel.conf ]]; then
    echo 'include /etc/spanel/vhosts/*.conf;' > /etc/nginx/conf.d/spanel.conf
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    ok "nginx wired to SPanel vhosts."
  fi

  # nginx reverse proxy for daemon HTTPS
  if [[ "$DAEMON_USE_SSL" == true ]]; then
    log "Configuring nginx HTTPS proxy for the daemon…"
    local DAEMON_NGINX="/etc/nginx/sites-available/spanel-daemon.conf"
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

    cat > "$DAEMON_NGINX" << 'DNGEOF'
server {
    listen 80;
    server_name FQDN_PLACEHOLDER;

    location / {
        proxy_pass http://127.0.0.1:PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 256m;
    }
}
DNGEOF
    sed -i "s/FQDN_PLACEHOLDER/$DAEMON_FQDN/g" "$DAEMON_NGINX"
    sed -i "s/PORT_PLACEHOLDER/$DAEMON_PORT/g" "$DAEMON_NGINX"
    ln -sf "$DAEMON_NGINX" /etc/nginx/sites-enabled/spanel-daemon.conf
    
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      ok "nginx: $DAEMON_FQDN → localhost:$DAEMON_PORT"
    else
      warn "nginx config test failed."
    fi

    # certbot for daemon
    log "Requesting SSL certificate for daemon…"
    command -v certbot >/dev/null 2>&1 || \
      apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
    certbot --nginx -d "$DAEMON_FQDN" --non-interactive --agree-tos --email "$DAEMON_SSL_EMAIL" --redirect || \
      warn "Certbot failed. Run: certbot --nginx -d $DAEMON_FQDN"
    ok "SSL certificate installed for daemon ($DAEMON_FQDN)."
    
    echo ""
    echo -e "  ${C_AMBER}IMPORTANT:${C_RESET} In Admin → Nodes, set:"
    echo -e "    Scheme: ${C_BOLD}HTTPS${C_RESET}"
    echo -e "    FQDN:   ${C_BOLD}$DAEMON_FQDN${C_RESET}"
    echo -e "    Port:   ${C_BOLD}443${C_RESET} (nginx handles TLS, daemon listens on $DAEMON_PORT internally)"
    echo ""
  fi

  # systemd
  local NODE_BIN="$(command -v node)"
  local ENTRYPOINT="/opt/spanel-daemon/dist/index.js"

  cat > /etc/systemd/system/spanel-daemon.service << SVCEOF
[Unit]
Description=SPanel Daemon
After=network-online.target docker.service
Requires=docker.service

[Service]
User=root
WorkingDirectory=/opt/spanel-daemon
ExecStart=${NODE_BIN} ${ENTRYPOINT} --config ${CONFIG_PATH}
Restart=on-failure
RestartSec=5
LimitNOFILE=65535
StandardOutput=append:/var/log/spanel/daemon.log
StandardError=append:/var/log/spanel/daemon.log

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable spanel-daemon
  systemctl restart spanel-daemon
  sleep 3
  if systemctl is-active --quiet spanel-daemon; then
    ok "Daemon is running on port $DAEMON_PORT!"
  else
    warn "Daemon did not start. Check: journalctl -u spanel-daemon -n 40"
    warn "Or: tail -30 /var/log/spanel/daemon.log"
  fi

  echo ""
  echo -e "  ${C_GREEN}Daemon installed successfully!${C_RESET}"
  if [[ "$DAEMON_USE_SSL" == true ]]; then
    echo -e "  Daemon URL: ${C_BOLD}https://$DAEMON_FQDN${C_RESET}"
    echo -e "  WebSocket:  ${C_BOLD}wss://$DAEMON_FQDN/api/servers/<uuid>/ws${C_RESET}"
  else
    echo -e "  Daemon URL: ${C_BOLD}http://$DAEMON_FQDN:$DAEMON_PORT${C_RESET}"
    echo -e "  WebSocket:  ${C_BOLD}ws://$DAEMON_FQDN:$DAEMON_PORT/api/servers/<uuid>/ws${C_RESET}"
  fi
  echo -e "  Firewall: open TCP ${C_BOLD}$DAEMON_PORT${C_RESET} plus game/web ports."
  echo ""
}

# ===========================================================================
# UNINSTALL
# ===========================================================================
uninstall_menu() {
  local items=()
  $PANEL_INSTALLED && items+=("Uninstall Panel")
  $DAEMON_INSTALLED && items+=("Uninstall Daemon")
  items+=("Back")

  local choice
  choice=$(menu "What would you like to uninstall?" "${items[@]}")

  local selected="${items[$((choice-1))]:-}"

  case "$selected" in
    "Uninstall Panel") uninstall_panel ;;
    "Uninstall Daemon") uninstall_daemon ;;
    "Back") return ;;
    *) warn "Invalid choice."; uninstall_menu ;;
  esac
}

uninstall_panel() {
  echo ""
  warn "This will stop and remove the spanel-panel systemd service."
  warn "Your code and database will NOT be deleted."
  echo ""
  ask_yn "Uninstall the panel service?" "n" || return

  log "Stopping panel…"
  systemctl stop spanel-panel 2>/dev/null || true
  systemctl disable spanel-panel 2>/dev/null || true
  rm -f /etc/systemd/system/spanel-panel.service
  rm -f /etc/nginx/sites-enabled/spanel-panel.conf
  rm -f /etc/nginx/sites-available/spanel-panel.conf
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  systemctl daemon-reload
  ok "Panel service removed."
  echo -e "  ${C_DIM}Code and database are still in place. Remove manually if needed.${C_RESET}"
  PANEL_INSTALLED=false
}

uninstall_daemon() {
  echo ""
  warn "This will stop and remove the spanel-daemon systemd service."
  warn "Server volumes in /var/lib/spanel/volumes will NOT be deleted."
  echo ""
  ask_yn "Uninstall the daemon service?" "n" || return

  log "Stopping daemon…"
  systemctl stop spanel-daemon 2>/dev/null || true
  systemctl disable spanel-daemon 2>/dev/null || true
  rm -f /etc/systemd/system/spanel-daemon.service
  rm -f /opt/spanel-daemon 2>/dev/null  # Remove symlink only
  systemctl daemon-reload
  ok "Daemon service removed."

  if ask_yn "Also remove /etc/spanel/config.yml?" "n"; then
    rm -f /etc/spanel/config.yml
    ok "Config removed."
  fi

  echo -e "  ${C_DIM}Server volumes and Docker containers are still in place.${C_RESET}"
  DAEMON_INSTALLED=false
}

# ===========================================================================
# MAIN MENU
# ===========================================================================
main_menu() {
  banner

  # Re-detect installed components every time
  PANEL_INSTALLED=false
  DAEMON_INSTALLED=false
  [[ -f /etc/systemd/system/spanel-panel.service ]] && PANEL_INSTALLED=true
  [[ -f /etc/systemd/system/spanel-daemon.service ]] && DAEMON_INSTALLED=true

  # Show status
  if $PANEL_INSTALLED; then
    if systemctl is-active --quiet spanel-panel 2>/dev/null; then
      echo -e "  Panel:  ${C_GREEN}● running${C_RESET}"
    else
      echo -e "  Panel:  ${C_RED}● stopped${C_RESET} (service installed)"
    fi
  else
    echo -e "  Panel:  ${C_DIM}not installed${C_RESET}"
  fi
  if $DAEMON_INSTALLED; then
    if systemctl is-active --quiet spanel-daemon 2>/dev/null; then
      echo -e "  Daemon: ${C_GREEN}● running${C_RESET}"
    else
      echo -e "  Daemon: ${C_RED}● stopped${C_RESET} (service installed)"
    fi
  else
    echo -e "  Daemon: ${C_DIM}not installed${C_RESET}"
  fi

  local items=()
  items+=("Install Panel")
  items+=("Install Daemon")
  items+=("Install Both")
  if $PANEL_INSTALLED || $DAEMON_INSTALLED; then
    items+=("Uninstall…")
  fi
  items+=("Exit")

  local choice
  choice=$(menu "What would you like to do?" "${items[@]}")
  local selected="${items[$((choice-1))]:-}"

  case "$selected" in
    "Install Panel")  install_panel; main_menu ;;
    "Install Daemon") install_daemon; main_menu ;;
    "Install Both")   install_panel; install_daemon; main_menu ;;
    "Uninstall…")     uninstall_menu; main_menu ;;
    "Exit")           echo ""; log "Goodbye!"; exit 0 ;;
    *)                warn "Invalid choice."; main_menu ;;
  esac
}

# ---------------------------------------------------------------------------
# Entry point.
#
# installer.sh (the one-line bootstrap) has already asked the user what they
# want, so it pre-selects the action via SPANEL_ACTION and we skip our own
# menu. Run this script directly and you get the interactive menu as before.
# ---------------------------------------------------------------------------
case "${SPANEL_ACTION:-}" in
  panel)     banner; install_panel ;;
  daemon)    banner; install_daemon ;;
  both)      banner; install_panel; install_daemon ;;
  uninstall) banner; uninstall_menu ;;
  *)         main_menu ;;
esac