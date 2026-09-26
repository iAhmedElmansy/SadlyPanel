#!/usr/bin/env bash
# ===========================================================================
#  SPanel — automatic installer
#
#  Run on a fresh Linux server as root:
#
#      bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)
#
#  This script is the bootstrap: it checks the machine, installs git and
#  Node.js, downloads SPanel to /var/www/SPanel, then hands over to
#  scripts/install.sh which does the actual Panel / Daemon setup.
#
#  Non-interactive:
#      bash installer.sh --panel          # install the web panel
#      bash installer.sh --daemon         # install a node daemon
#      bash installer.sh --both           # both on one machine
#      bash installer.sh --update         # update everything installed here
#      bash installer.sh --update-panel   # update only the panel
#      bash installer.sh --update-daemon  # update only the daemon
#      bash installer.sh --uninstall      # remove services
#
#  Overridable with environment variables:
#      SPANEL_REPO    git url          (default: this repository)
#      SPANEL_BRANCH  branch to track  (default: main)
#      SPANEL_DIR     install path     (default: /var/www/SPanel)
#
#  Licensed MIT. https://github.com/iAhmedElmansy/SadlyPanel
# ===========================================================================
set -euo pipefail

REPO_URL="${SPANEL_REPO:-https://github.com/iAhmedElmansy/SadlyPanel.git}"
REPO_BRANCH="${SPANEL_BRANCH:-main}"
INSTALL_DIR="${SPANEL_DIR:-/var/www/SPanel}"
INSTALLER_VERSION="1.2.0"

# ---- colours + output -----------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET="\033[0m"; C_BLUE="\033[38;5;39m"; C_GREEN="\033[38;5;41m"
  C_AMBER="\033[38;5;214m"; C_RED="\033[38;5;203m"; C_DIM="\033[38;5;244m"
  C_BOLD="\033[1m"
else
  C_RESET=""; C_BLUE=""; C_GREEN=""; C_AMBER=""; C_RED=""; C_DIM=""; C_BOLD=""
fi

log()  { printf "${C_BLUE}[spanel]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET}  %s\n" "$*"; }
warn() { printf "${C_AMBER}  !${C_RESET}  %s\n" "$*" >&2; }
fail() { printf "${C_RED}  ✗${C_RESET}  %s\n" "$*" >&2; }

die() {
  fail "$*"
  echo ""
  echo -e "  ${C_DIM}Need a hand? Open an issue:${C_RESET}"
  echo -e "  ${C_DIM}https://github.com/iAhmedElmansy/SadlyPanel/issues${C_RESET}"
  echo ""
  exit 1
}

# Always read from the terminal, so the script also works when it is piped
# into bash (`curl … | bash`) rather than run via `bash <(curl …)`.
ask_yn() {
  local prompt="$1" default="${2:-y}" result
  read -rp "$(printf "${C_BLUE}[?]${C_RESET} %s [%s]: " "$prompt" "$default")" result </dev/tty
  result="${result:-$default}"
  [[ "${result,,}" == "y" || "${result,,}" == "yes" ]]
}

banner() {
  clear 2>/dev/null || true
  echo ""
  echo -e "  ${C_BLUE}███████╗${C_RESET}${C_BOLD}██████╗  █████╗ ███╗   ██╗███████╗██╗     ${C_RESET}"
  echo -e "  ${C_BLUE}██╔════╝${C_RESET}${C_BOLD}██╔══██╗██╔══██╗████╗  ██║██╔════╝██║     ${C_RESET}"
  echo -e "  ${C_BLUE}███████╗${C_RESET}${C_BOLD}██████╔╝███████║██╔██╗ ██║█████╗  ██║     ${C_RESET}"
  echo -e "  ${C_BLUE}╚════██║${C_RESET}${C_BOLD}██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║     ${C_RESET}"
  echo -e "  ${C_BLUE}███████║${C_RESET}${C_BOLD}██║     ██║  ██║██║ ╚████║███████╗███████╗${C_RESET}"
  echo -e "  ${C_BLUE}╚══════╝${C_RESET}${C_BOLD}╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝${C_RESET}"
  echo ""
  echo -e "  ${C_DIM}Game, application and web hosting control panel${C_RESET}"
  echo -e "  ${C_DIM}installer v${INSTALLER_VERSION} · github.com/iAhmedElmansy/SadlyPanel${C_RESET}"
  echo ""
}

# ===========================================================================
# Preflight
# ===========================================================================
OS_ID=""; OS_VERSION=""; OS_NAME=""; PKG=""

preflight() {
  log "Checking this machine…"

  [[ -n "${BASH_VERSION:-}" ]] || die "Run this with bash, not sh:  bash installer.sh"
  (( ${BASH_VERSINFO[0]} >= 4 )) || die "bash 4.0+ required (found ${BASH_VERSION})."
  [[ "$(uname -s)" == "Linux" ]] || die "SPanel nodes run on Linux. This is $(uname -s)."
  [[ $EUID -eq 0 ]] || die "Run this as root:  sudo bash <(curl -sSL ${REPO_URL%.git}/raw/main/installer.sh)"

  local arch; arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64|aarch64|arm64) ok "Architecture: $arch" ;;
    *) die "Unsupported architecture: $arch (need x86_64 or arm64)." ;;
  esac

  command -v systemctl >/dev/null 2>&1 || die "systemd is required (systemctl not found)."

  [[ -r /etc/os-release ]] || die "Cannot read /etc/os-release — unknown distribution."
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"
  OS_VERSION="${VERSION_ID:-0}"
  OS_NAME="${PRETTY_NAME:-$OS_ID $OS_VERSION}"

  if command -v apt-get >/dev/null 2>&1; then
    PKG="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG="dnf"
  else
    die "No supported package manager found (need apt-get or dnf)."
  fi

  # Version gate. Kept as plain if/then so no branch ends on a failing
  # `&&` list, which would trip `set -e`.
  local major="${OS_VERSION%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] || major=0
  local supported=false
  case "$OS_ID" in
    ubuntu)
      if [[ "$OS_VERSION" == "20.04" || "$OS_VERSION" == "22.04" || "$OS_VERSION" == "24.04" ]]; then
        supported=true
      fi
      ;;
    debian)
      if (( major >= 11 )); then supported=true; fi
      ;;
    rocky|almalinux|rhel)
      if (( major >= 8 )); then supported=true; fi
      ;;
    centos)
      if (( major >= 9 )); then supported=true; fi
      ;;
    fedora)
      if (( major >= 38 )); then supported=true; fi
      ;;
  esac

  if $supported; then
    ok "$OS_NAME"
  else
    warn "$OS_NAME is not on the tested list."
    echo -e "  ${C_DIM}Tested: Ubuntu 20.04/22.04/24.04 · Debian 11+ · Rocky/Alma 8+ · Fedora 38+${C_RESET}"
    ask_yn "Continue anyway?" "n" || die "Cancelled."
  fi

  local free_mb=""
  free_mb="$(df -Pm /var 2>/dev/null | awk 'NR==2{print $4}')" || true
  if [[ "$free_mb" =~ ^[0-9]+$ ]] && (( free_mb < 2048 )); then
    warn "Only ${free_mb}MB free on /var. SPanel plus Docker images wants 10GB+."
    ask_yn "Continue anyway?" "n" || die "Cancelled."
  fi
}

# ===========================================================================
# Dependencies
# ===========================================================================
pkg_install() {
  if [[ "$PKG" == "apt" ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" >/dev/null 2>&1
  else
    dnf install -y "$@" >/dev/null 2>&1
  fi
}

ensure_base_packages() {
  log "Installing base packages…"
  if [[ "$PKG" == "apt" ]]; then
    DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null 2>&1 || \
      warn "apt-get update reported errors; continuing."
  fi

  # Plain string rather than an array: `${#arr[@]}` on an empty array is an
  # "unbound variable" error under `set -u` on bash older than 4.4.
  local missing=""
  for bin in curl git tar openssl; do
    command -v "$bin" >/dev/null 2>&1 || missing="$missing $bin"
  done

  if [[ -n "${missing// /}" ]]; then
    # shellcheck disable=SC2086  # intentional word splitting
    pkg_install ca-certificates gnupg $missing || \
      die "Could not install:$missing. Install them manually and re-run."
  else
    pkg_install ca-certificates gnupg || true
  fi

  for bin in curl git tar openssl; do
    command -v "$bin" >/dev/null 2>&1 || die "$bin is still missing after install."
  done
  ok "curl, git, tar, openssl ready."
}

ensure_node() {
  local major=0
  if command -v node >/dev/null 2>&1; then
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  fi
  [[ "$major" =~ ^[0-9]+$ ]] || major=0

  if (( major >= 20 )); then
    ok "Node.js $(node -v)"
    return
  fi

  log "Installing Node.js 22…"
  if [[ "$PKG" == "apt" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || \
      die "NodeSource setup failed. Install Node.js 20+ manually and re-run."
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1 || \
      die "apt-get install nodejs failed. Install Node.js 20+ manually and re-run."
  else
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || \
      die "NodeSource setup failed. Install Node.js 20+ manually and re-run."
    dnf install -y nodejs >/dev/null 2>&1 || \
      die "dnf install nodejs failed. Install Node.js 20+ manually and re-run."
  fi

  command -v node >/dev/null 2>&1 || die "Node.js install failed."
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [[ "$major" =~ ^[0-9]+$ ]] || major=0
  (( major >= 20 )) || die "Node.js $major is too old; SPanel needs 20+."
  ok "Node.js $(node -v)"
}

# ===========================================================================
# Source
# ===========================================================================
fetch_source() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Updating SPanel in $INSTALL_DIR…"
    git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL" 2>/dev/null || \
      git -C "$INSTALL_DIR" remote add origin "$REPO_URL"
    # Deepen a shallow clone once so fast-forward + file diffing have history.
    if [[ "$(git -C "$INSTALL_DIR" rev-parse --is-shallow-repository 2>/dev/null)" == "true" ]]; then
      git -C "$INSTALL_DIR" fetch --unshallow origin "$REPO_BRANCH" >/dev/null 2>&1 || \
        git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH" >/dev/null 2>&1 || \
        die "Could not reach $REPO_URL. Check the server's network and DNS."
    else
      git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH" >/dev/null 2>&1 || \
        die "Could not reach $REPO_URL. Check the server's network and DNS."
    fi

    UPDATE_OLD_REV="$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "")"
    # Fast-forward only — never `reset --hard` over local commits or edits, so a
    # customised checkout is reported instead of being silently clobbered.
    if ! git -C "$INSTALL_DIR" merge --ff-only "origin/$REPO_BRANCH" >/dev/null 2>&1; then
      die "Cannot fast-forward $INSTALL_DIR to origin/$REPO_BRANCH.
      This usually means local commits or uncommitted changes to tracked files.
      Inspect with:  git -C $INSTALL_DIR status
      Nothing was changed."
    fi
    UPDATE_NEW_REV="$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "")"
    if [[ -n "$UPDATE_OLD_REV" && "$UPDATE_OLD_REV" != "$UPDATE_NEW_REV" ]]; then
      CHANGED_FILES="$(git -C "$INSTALL_DIR" diff --name-only "$UPDATE_OLD_REV" "$UPDATE_NEW_REV" 2>/dev/null)"
    else
      CHANGED_FILES=""
    fi
    ok "Source updated ($(git -C "$INSTALL_DIR" rev-parse --short HEAD))."
    return
  fi

  if [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
    die "$INSTALL_DIR already exists and is not a git checkout.
      Move it aside, or point somewhere else with:  SPANEL_DIR=/opt/spanel bash installer.sh"
  fi

  log "Downloading SPanel into $INSTALL_DIR…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 || \
    die "Clone failed from $REPO_URL (branch $REPO_BRANCH). Check the server's network and DNS."
  CHANGED_FILES="__ALL__"
  ok "Source downloaded ($(git -C "$INSTALL_DIR" rev-parse --short HEAD))."
}

# Small convenience wrapper so the admin never has to remember this URL again.
install_wrapper() {
  cat > /usr/local/bin/spanel << WRAPEOF
#!/usr/bin/env bash
# SPanel management shortcut — installed by installer.sh
SPANEL_DIR="${INSTALL_DIR}"
case "\${1:-menu}" in
  menu|"")      exec bash "\${SPANEL_DIR}/installer.sh" ;;
  update)       exec bash "\${SPANEL_DIR}/installer.sh" --update ;;
  update-panel) exec bash "\${SPANEL_DIR}/installer.sh" --update-panel ;;
  update-daemon)exec bash "\${SPANEL_DIR}/installer.sh" --update-daemon ;;
  uninstall)    exec bash "\${SPANEL_DIR}/installer.sh" --uninstall ;;
  status)       systemctl status spanel-panel spanel-daemon --no-pager ;;
  restart)      systemctl restart spanel-panel 2>/dev/null; systemctl restart spanel-daemon 2>/dev/null; echo "restarted" ;;
  logs)         journalctl -u "spanel-\${2:-panel}" -f ;;
  *)            echo "usage: spanel [menu|update|update-panel|update-daemon|uninstall|status|restart|logs <panel|daemon>]" ;;
esac
WRAPEOF
  chmod +x /usr/local/bin/spanel
  ok "'spanel' command installed (try: spanel status)."
}

# ===========================================================================
# Actions
# ===========================================================================
hand_off() {
  local action="$1"
  [[ -f "$INSTALL_DIR/scripts/install.sh" ]] || \
    die "$INSTALL_DIR/scripts/install.sh is missing — the download looks incomplete."

  install_wrapper
  echo ""
  log "Starting the $action installer…"
  SPANEL_ACTION="$action" SPANEL_DIR="$INSTALL_DIR" \
    bash "$INSTALL_DIR/scripts/install.sh"
}

# Shared update plumbing. prepare_source runs at most once per invocation even
# when both the panel and the daemon are being rebuilt, guarded by
# SOURCE_PREPARED so a "both" update doesn't fetch and npm-install twice.
SOURCE_PREPARED=false
# Populated by fetch_source on an update: the newline-separated list of files
# that changed between the old and new HEAD. "__ALL__" means a fresh checkout
# (rebuild everything); empty means nothing changed.
CHANGED_FILES="__ALL__"
UPDATE_OLD_REV=""
UPDATE_NEW_REV=""

# --- incremental-update predicates -----------------------------------------
# true when a full rebuild is warranted (fresh clone) or a path under $1 changed.
source_changed() {
  [[ "$CHANGED_FILES" == "__ALL__" ]] && return 0
  [[ -n "$CHANGED_FILES" ]] && grep -q "^$1" <<<"$CHANGED_FILES"
}
# true when the *shared root* dependencies changed (the root package.json or the
# repo-wide package-lock.json) — a rebuild of both components is then warranted.
# Per-workspace package.json edits are caught by source_changed "apps/<svc>/"
# instead, so a panel-only metadata change never forces a daemon rebuild.
source_changed_deps() {
  [[ "$CHANGED_FILES" == "__ALL__" ]] && return 0
  [[ -n "$CHANGED_FILES" ]] && grep -qE '^package(-lock)?\.json$' <<<"$CHANGED_FILES"
}
# true when the update changed nothing at all.
update_is_noop() {
  [[ "$CHANGED_FILES" != "__ALL__" && -z "$CHANGED_FILES" ]]
}

prepare_source() {
  if $SOURCE_PREPARED; then return; fi
  fetch_source
  if source_changed_deps; then
    log "Installing dependencies (lockfile or a package.json changed)…"
    ( cd "$INSTALL_DIR" && npm install --no-audit --no-fund ) || die "npm install failed."
    ok "Dependencies installed."
  else
    ok "Dependencies unchanged; skipping npm install."
  fi
  SOURCE_PREPARED=true
}

rebuild_panel() {
  log "Applying database schema…"
  # Run from the panel workspace so Prisma loads apps/panel/.env (which holds
  # DATABASE_URL). From the repo root Prisma only checks the root and the
  # schema folder for .env — neither has it — and dies with P1012.
  ( cd "$INSTALL_DIR/apps/panel" && npx prisma db push \
      --schema prisma/schema.prisma --accept-data-loss ) || \
    die "prisma db push failed."
  ok "Schema up to date."

  # Wipe the compiled output before rebuilding. A stale .next is exactly what
  # makes an updated checkout keep serving the *old* pages after a git pull —
  # the root cause of "it installed an old version".
  rm -rf "$INSTALL_DIR/apps/panel/.next"

  log "Building the panel… (this takes a few minutes)"
  ( cd "$INSTALL_DIR" && NODE_ENV=production npm run build --workspace @sadlystudios-panel/panel ) || \
    die "Panel build failed."
  ok "Panel built."
}

rebuild_daemon() {
  log "Building the daemon…"
  ( cd "$INSTALL_DIR" && npm run build --workspace @sadlystudios-daemon/daemon ) || \
    die "Daemon build failed."
  ok "Daemon built."
}

restart_service() {
  local svc="$1"
  if systemctl restart "spanel-$svc"; then
    ok "spanel-$svc restarted."
  else
    warn "spanel-$svc failed to restart — journalctl -u spanel-$svc -n 40"
  fi
}

do_update() {
  [[ -d "$INSTALL_DIR/.git" ]] || \
    die "No SPanel checkout at $INSTALL_DIR. Install it first."

  banner
  log "Updating SPanel at $INSTALL_DIR"
  echo ""

  local panel_installed=false daemon_installed=false
  if [[ -f /etc/systemd/system/spanel-panel.service ]]; then panel_installed=true; fi
  if [[ -f /etc/systemd/system/spanel-daemon.service ]]; then daemon_installed=true; fi

  if ! $panel_installed && ! $daemon_installed; then
    die "No SPanel services are installed on this machine — nothing to update.
      Install the Panel or a Daemon first (spanel menu)."
  fi

  prepare_source

  if update_is_noop; then
    install_wrapper
    echo ""
    ok "Already up to date ($(git -C "$INSTALL_DIR" rev-parse --short HEAD)); nothing to rebuild."
    echo ""
    return
  fi

  local build_panel=false build_daemon=false
  if $panel_installed && { source_changed "apps/panel/" || source_changed_deps; }; then build_panel=true; fi
  if $daemon_installed && { source_changed "apps/daemon/" || source_changed_deps; }; then build_daemon=true; fi

  if ! $build_panel && ! $build_daemon; then
    install_wrapper
    echo ""
    ok "Updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD); no panel/daemon code changed, so no rebuild or restart was needed."
    echo ""
    return
  fi

  $build_panel && rebuild_panel
  $build_daemon && rebuild_daemon

  install_wrapper

  echo ""
  log "Restarting updated services…"
  $build_panel && restart_service panel
  $build_daemon && restart_service daemon

  echo ""
  ok "Update complete."
  echo ""
}

do_update_panel() {
  [[ -d "$INSTALL_DIR/.git" ]] || \
    die "No SPanel checkout at $INSTALL_DIR. Install it first."
  [[ -f /etc/systemd/system/spanel-panel.service ]] || \
    die "The Panel is not installed on this machine — nothing to update.
      Install it first (spanel menu)."

  banner
  log "Updating the Panel at $INSTALL_DIR"
  echo ""

  # Explicit single-service update: always rebuild + restart, even when the
  # fetch changed nothing under apps/panel/ — an explicit request is a force.
  prepare_source

  rebuild_panel
  install_wrapper

  echo ""
  log "Restarting the panel…"
  restart_service panel

  echo ""
  ok "Panel update complete."
  echo ""
}

do_update_daemon() {
  [[ -d "$INSTALL_DIR/.git" ]] || \
    die "No SPanel checkout at $INSTALL_DIR. Install it first."
  [[ -f /etc/systemd/system/spanel-daemon.service ]] || \
    die "The Daemon is not installed on this machine — nothing to update.
      Install it first (spanel menu)."

  banner
  log "Updating the Daemon at $INSTALL_DIR"
  echo ""

  # Explicit single-service update: always rebuild + restart, even when the
  # fetch changed nothing under apps/daemon/ — an explicit request is a force.
  prepare_source

  rebuild_daemon
  install_wrapper

  echo ""
  log "Restarting the daemon…"
  restart_service daemon

  echo ""
  ok "Daemon update complete."
  echo ""
}

# ===========================================================================
# Menu
# ===========================================================================
main_menu() {
  banner

  local panel_state daemon_state
  if [[ -f /etc/systemd/system/spanel-panel.service ]]; then
    systemctl is-active --quiet spanel-panel 2>/dev/null \
      && panel_state="${C_GREEN}● running${C_RESET}" \
      || panel_state="${C_RED}● stopped${C_RESET}"
  else
    panel_state="${C_DIM}not installed${C_RESET}"
  fi
  if [[ -f /etc/systemd/system/spanel-daemon.service ]]; then
    systemctl is-active --quiet spanel-daemon 2>/dev/null \
      && daemon_state="${C_GREEN}● running${C_RESET}" \
      || daemon_state="${C_RED}● stopped${C_RESET}"
  else
    daemon_state="${C_DIM}not installed${C_RESET}"
  fi

  echo -e "  Panel:  $panel_state"
  echo -e "  Daemon: $daemon_state"
  echo ""
  echo -e "  ${C_BOLD}What would you like to do?${C_RESET}"
  echo ""
  echo -e "    ${C_GREEN}1)${C_RESET} Install the Panel        ${C_DIM}the web interface your users log into${C_RESET}"
  echo -e "    ${C_GREEN}2)${C_RESET} Install a Daemon (node)  ${C_DIM}the machine that actually runs servers${C_RESET}"
  echo -e "    ${C_GREEN}3)${C_RESET} Install both             ${C_DIM}everything on this one machine${C_RESET}"
  echo -e "    ${C_GREEN}4)${C_RESET} Update the Panel         ${C_DIM}rebuild just the web interface${C_RESET}"
  echo -e "    ${C_GREEN}5)${C_RESET} Update the Daemon        ${C_DIM}rebuild just the node daemon${C_RESET}"
  echo -e "    ${C_GREEN}6)${C_RESET} Update everything        ${C_DIM}pull the latest and rebuild all${C_RESET}"
  echo -e "    ${C_GREEN}7)${C_RESET} Uninstall                ${C_DIM}remove services, keep your data${C_RESET}"
  echo -e "    ${C_GREEN}8)${C_RESET} Exit"
  echo ""

  local choice
  read -rp "$(printf "${C_BLUE}[?]${C_RESET} Enter your choice [1]: ")" choice </dev/tty
  choice="${choice:-1}"

  case "$choice" in
    1) run_action panel ;;
    2) run_action daemon ;;
    3) run_action both ;;
    4) run_action update-panel ;;
    5) run_action update-daemon ;;
    6) run_action update ;;
    7) run_action uninstall ;;
    8) echo ""; log "Goodbye!"; exit 0 ;;
    *) warn "Pick a number from 1 to 8."; sleep 1; main_menu ;;
  esac
}

run_action() {
  local action="$1"

  case "$action" in
    update|update-panel|update-daemon)
      preflight
      ensure_base_packages
      ensure_node
      case "$action" in
        update)        do_update ;;
        update-panel)  do_update_panel ;;
        update-daemon) do_update_daemon ;;
      esac
      ;;
    uninstall)
      [[ $EUID -eq 0 ]] || die "Run this as root (use sudo)."
      [[ -f "$INSTALL_DIR/scripts/install.sh" ]] || \
        die "No SPanel checkout at $INSTALL_DIR — nothing to uninstall."
      SPANEL_ACTION=uninstall SPANEL_DIR="$INSTALL_DIR" \
        bash "$INSTALL_DIR/scripts/install.sh"
      ;;
    panel|daemon|both)
      preflight
      ensure_base_packages
      ensure_node
      fetch_source
      hand_off "$action"
      ;;
    *)
      die "Unknown action: $action"
      ;;
  esac
}

# ===========================================================================
# Entry point
# ===========================================================================
case "${1:-}" in
  --panel)     run_action panel ;;
  --daemon)    run_action daemon ;;
  --both)      run_action both ;;
  --update)    run_action update ;;
  --uninstall) run_action uninstall ;;
  --version)   echo "SPanel installer v${INSTALLER_VERSION}"; exit 0 ;;
  -h|--help)
    cat << 'HELPEOF'
SPanel installer — run as root on a fresh Linux server.

  bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)

With no arguments you get an interactive menu. To skip it:

  --panel        install the web panel
  --daemon       install a node daemon
  --both         install both on this machine
  --update       update an existing install and restart services
  --uninstall    remove the systemd services (your data is kept)
  --version      print the installer version

Environment overrides:

  SPANEL_REPO    git url to install from
  SPANEL_BRANCH  branch to track                (default: main)
  SPANEL_DIR     where to install               (default: /var/www/SPanel)

Docs: https://github.com/iAhmedElmansy/SadlyPanel
HELPEOF
    exit 0
    ;;
  "")
    if [[ ! -r /dev/tty ]]; then
      die "No terminal available for the menu. Pass an action instead, e.g.:
      bash installer.sh --both      (see --help)"
    fi
    main_menu
    ;;
  *)           die "Unknown option: $1  (try --help)" ;;
esac
