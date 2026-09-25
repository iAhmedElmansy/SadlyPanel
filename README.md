<h1 align="center">SPanel</h1>

<p align="center">
  <strong>A game, application and web hosting control panel.</strong><br>
  Pterodactyl-style Panel + Daemon architecture, built on Next.js 15, React 19, TypeScript and Docker.
</p>

<p align="center">
  <img alt="License"  src="https://img.shields.io/badge/license-MIT-2ea043?style=flat-square">
  <img alt="Node"     src="https://img.shields.io/badge/node-%E2%89%A520.11-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="Next.js"  src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="Prisma"   src="https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma&logoColor=white">
  <img alt="Platform" src="https://img.shields.io/badge/nodes-Linux%20%2B%20Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
</p>

---

## Install in one line

On a fresh Linux server, as root:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)
```

That's the whole thing. The installer checks your machine, installs everything it
needs, downloads SPanel and walks you through the rest:

```
  Panel:  not installed
  Daemon: not installed

  What would you like to do?

    1) Install the Panel        the web interface your users log into
    2) Install a Daemon (node)  the machine that actually runs servers
    3) Install both             everything on this one machine
    4) Update SPanel            pull the latest version and rebuild
    5) Uninstall                remove services, keep your data
    6) Exit
```

**Pick 3** if you're starting out and want one server that does everything.
Pick 1 and 2 separately when the panel and the game nodes live on different machines.

It installs and configures: **Node.js 22**, **Docker**, **nginx**, **certbot** (free
HTTPS), the database schema and seed data, a `spanel` system user, and `systemd`
units so everything restarts on boot. When it finishes, open the URL it prints and
create your admin account at `/auth/register`.

<details>
<summary><strong>Non-interactive / scripted install</strong></summary>

```bash
# skip the menu
bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh) --both

# install somewhere other than /var/www/SPanel
SPANEL_DIR=/opt/spanel bash <(curl -sSL .../installer.sh) --panel
```

| Flag | Does |
|---|---|
| `--panel` | Install the web panel |
| `--daemon` | Install a node daemon |
| `--both` | Install both on this machine |
| `--update` | Pull the latest version, rebuild, restart |
| `--uninstall` | Remove the systemd services (data is kept) |
| `--help` | Full usage |

| Variable | Default | Does |
|---|---|---|
| `SPANEL_DIR` | `/var/www/SPanel` | Where SPanel is installed |
| `SPANEL_REPO` | this repository | Git URL to install from |
| `SPANEL_BRANCH` | `main` | Branch to track |

</details>

**Supported:** Ubuntu 20.04 / 22.04 / 24.04 · Debian 11+ · Rocky & AlmaLinux 8+ ·
Fedora 38+. Anything else with `systemd` and `apt`/`dnf` will probably work — the
installer asks before continuing.

---

## التثبيت بأمر واحد

على سيرفر Linux جديد، نفّذ هذا الأمر كـ root:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/iAhmedElmansy/SadlyPanel/main/installer.sh)
```

هذا كل شيء. المثبّت سيفحص السيرفر، ويثبّت كل المتطلبات (Node.js و Docker و nginx
و شهادة SSL مجانية)، وينزّل المشروع، ثم يعرض لك قائمة بسيطة:

- **1)** تثبيت البانل — الواجهة التي يدخل إليها المستخدمون
- **2)** تثبيت الـDaemon — الجهاز الذي يشغّل السيرفرات فعلياً
- **3)** تثبيت الاثنين معاً على نفس الجهاز ← **اختر هذا إذا كنت تبدأ الآن**
- **4)** تحديث SPanel إلى آخر إصدار
- **5)** إزالة الخدمات (بدون حذف بياناتك)

بعد الانتهاء افتح الرابط الذي يظهر لك، وأنشئ حساب المدير من `/auth/register`.

بعد التثبيت يصبح لديك أمر `spanel` لإدارة كل شيء:

```bash
spanel status      # حالة الخدمات
spanel update      # تحديث لآخر إصدار
spanel restart     # إعادة تشغيل
spanel logs panel  # متابعة اللوقات
```

---

## What SPanel is

The **panel** is the control plane: users, servers, resource limits, ports, domains,
databases and settings. The **daemon** runs on each node and does the real work:
Docker container lifecycle, RAM/disk/CPU enforcement, live console, file management,
backups and reverse-proxy vhosts for websites.

```
                    ┌──────────────────────────────┐
   browser  ───────▶│  Panel  (Next.js 15 + Prisma)│
                    │  users · servers · billing   │
                    │  limits · domains · eggs     │
                    └───────────────┬──────────────┘
                                    │  signed HTTPS
                                    │  Bearer <tokenId>.<token> + HMAC-SHA256
                    ┌───────────────┴──────────────┐
                    ▼               ▼              ▼
              ┌──────────┐    ┌──────────┐   ┌──────────┐
              │ Daemon   │    │ Daemon   │   │ Daemon   │   ← one per node
              │ node-eu  │    │ node-us  │   │ node-me  │
              └────┬─────┘    └────┬─────┘   └────┬─────┘
                   │  Docker       │              │
              ┌────┴────┐     ┌────┴────┐    ┌────┴────┐
              │ servers │     │ servers │    │ servers │
              └─────────┘     └─────────┘    └─────────┘
```

```
SPanel/
├─ installer.sh    one-line bootstrap installer
├─ apps/
│  ├─ panel/       Next.js 15 + Prisma control plane (this is the website)
│  └─ daemon/      Node.js agent installed on every node
├─ scripts/        installer internals, tests, maintenance helpers
└─ package.json    npm workspaces root
```

---

## Features

### Auth
- `/auth/register` — first run only: creates the first user as **admin**. Locked
  afterwards unless registration is opened in the admin area.
- `/auth/login` — sign in with **username or email** + password.
- DB-backed sessions: signed JWT cookie + hashed server-side token, revocable,
  bcrypt password hashing, failed-login rate limiting, Edge middleware gating.

### Client dashboard (`/dashboard`)
- Server list with live status, address, and RAM/disk/CPU allocation.
- Create-server wizard: service → node → primary/extra ports → limits → hostname.
- Per-server tabs: Console, Files, Databases, Network, Backups, Startup, Schedules,
  Users, Settings.
- Console is a real xterm.js terminal over websocket to the node, with live
  memory/CPU/disk meters, power controls and command history.
- File manager: browse, edit, create, rename, delete, chmod, compress/extract,
  pull from URL — all path-traversal guarded on the daemon.
- Databases: real MySQL databases + scoped users, password rotation.
- Network: attach a managed subdomain or your own domain, pick the primary port.
- Subusers with 25 granular permissions.

### Admin area (`/admin`)
- **Site settings** — name, logo, favicon, accent colour, tagline, registration
  policy, per-user server limit.
- **SMTP** — host/port/encryption/credentials, test email, encrypted password at rest.
- **Users** — create, edit, disable, delete (last-admin protection).
- **Nodes** — FQDN/scheme/ports, RAM/disk/CPU pool with overallocation, generated
  daemon config + install command, token rotation, connection test.
- **Node telemetry** — live CPU/RAM/disk/latency charts from the daemon's 15 s
  heartbeat, hardware inventory, and online/degraded/offline health per node.
- **Ports** — bulk allocation creation (`25565`, `25570-25580`), prune unused.
- **Domains & subdomains** — public/private, wildcard, Cloudflare or manual DNS.
- **Database hosts** — MySQL/MariaDB endpoints with cached reachability probes.
- **All servers** — edit limits (validated against node capacity), suspend,
  transfer, delete.
- **Services** — full egg editor (runtime, parsers, install script, variables) plus
  Pterodactyl-compatible egg/nest import and export.
- **Audit log** — filterable activity feed of admin, auth and server events.

### Services included (seeded)
| Category | Services |
|---|---|
| Minecraft | Paper, Vanilla, Fabric, Forge, BungeeCord |
| Applications | Node.js generic, Node.js Discord bot |
| Web hosting | Static HTML (nginx), PHP website (PHP-FPM + nginx) |

Anything else you need can be imported as a Pterodactyl egg.

### Resource control (enforced by the daemon, not just displayed)
- Memory → `Memory` / `MemorySwap` / `MemoryReservation`, optional OOM killer
- CPU → `CpuQuota`/`CpuPeriod` (100% = 1 core) and optional core pinning
- Disk → recursive volume measurement; boot is blocked and a running server is
  stopped when it exceeds its quota
- Block IO weight, PID limit, dropped capabilities, `no-new-privileges`

### Domains instead of ip:port
- **Websites** — nginx vhost with automatic HTTPS, HTTP→HTTPS redirect, static root
  or PHP-FPM fastcgi
- **Minecraft** — SRV record intent written for DNS automation, so players connect
  without a port
- **Applications** — reverse proxy with websocket upgrade support

---

## Requirements

|  | Panel | Node (daemon) |
|---|---|---|
| OS | Linux (any with systemd) | Linux |
| Node.js | 20.11+ (22 recommended) | 20.11+ |
| Needs | nginx, certbot | Docker, nginx, certbot |
| Database | SQLite by default; PostgreSQL/MySQL supported | — |
| RAM | 1 GB | whatever you intend to hand out |

The installer puts all of this in place for you. The panel defaults to **SQLite** so
it boots with zero external services — switch to PostgreSQL or MySQL any time, no
code changes needed.

---

## Managing your install

The installer drops a `spanel` command on the machine:

```bash
spanel             # the installer menu again
spanel status      # systemd status for panel + daemon
spanel restart     # restart both services
spanel update      # pull latest, rebuild, restart
spanel logs panel  # follow logs (or: spanel logs daemon)
spanel uninstall   # remove services, keep data
```

Or drive systemd directly:

```bash
systemctl status spanel-panel
systemctl status spanel-daemon
journalctl -u spanel-panel -f
tail -f /var/log/spanel/panel.log
```

### Updating

```bash
spanel update
```

Pulls the latest code, reinstalls dependencies, applies any schema changes,
rebuilds whichever components are installed and restarts them. See
[installation.md](installation.md) if you'd rather run the steps by hand.

### Uninstalling

```bash
spanel uninstall
```

Removes the systemd units and nginx vhosts. **Your code, database, server volumes
and Docker containers are left alone** — delete `/var/www/SPanel` and
`/var/lib/spanel` yourself if you really want them gone.

---

## Adding a node

A node is a machine that actually runs servers. The panel machine can be its own
node (that's what **Install both** does), but you'll want more as you grow.

1. **Admin → Nodes → Add node** — name, FQDN, scheme, daemon port, and the
   RAM/disk/CPU pool this machine may hand out.
2. Open the node and copy the generated **install command**. It embeds the node's
   token, so treat it like a password.
3. Run it on the new machine as root. It installs Docker, Node.js, nginx, certbot,
   the `spanel` user and directories, builds the daemon, writes
   `/etc/spanel/config.yml` (fetched from the panel) and enables the systemd unit.
4. The daemon starts sending a heartbeat every 15 s. The node page shows live
   CPU/RAM/disk/latency charts and the detected hardware.
5. Back in the panel: **Test connection** should report the daemon version, CPU
   count and Docker version.
6. **Admin → Ports** — add an allocation range (e.g. `25565-25585`).
7. **Admin → Domains** — add your domain, point DNS (ideally a wildcard `*`) at the node.
8. **Admin → Database hosts** — add MySQL if you want per-server databases.

Daemon operations:

```bash
spanel-daemon doctor           # Node/Docker/config/credential preflight
spanel-daemon service status   # or start|stop|restart|logs
curl http://127.0.0.1:8282/api/health
```

---

## Manual installation

Prefer to do it yourself, or developing locally? The installer is optional.

```bash
git clone https://github.com/iAhmedElmansy/SadlyPanel.git
cd SadlyPanel
npm install

cd apps/panel
cp .env.example .env

# generate a real APP_KEY and paste it into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
cd ../..

npm run db:push     # create the schema
npm run db:seed     # install nests/eggs + defaults
npm run dev         # http://localhost:3110
```

Then open `/auth/register` and create the first administrator. You'll land on
`/admin` with a setup checklist.

For production:

```bash
npm run build       # builds panel and daemon
npm start           # panel on :3110
```

Put the panel behind nginx or Caddy with TLS and set `APP_URL` to the public URL.

### Environment (`apps/panel/.env`)

| Variable | Default | What it's for |
|---|---|---|
| `APP_URL` | — | Public URL of the panel. Used in emails and redirects. |
| `APP_NAME` | `SPanel` | Shown in the UI and emails. |
| `APP_KEY` | — | **Required.** 32+ chars. AES-256-GCM key for secrets at rest + session JWT signing. |
| `DATABASE_URL` | `file:./dev.db` | SQLite path, or a Postgres/MySQL connection string. |
| `SESSION_COOKIE` | `spanel_session` | Session cookie name. |
| `SESSION_TTL_DAYS` | `14` | How long a session stays valid. |
| `TRUST_PROXY` | `true` | Honour `X-Forwarded-*` — keep on behind nginx. |
| `OPEN_REGISTRATION` | `false` | Public sign-up. Off by default. |
| `UPLOAD_DIR` | `public/uploads` | Where branding uploads land. |
| `SCHEDULER_INTERVAL_MS` | `30000` | Background worker tick. |

### Switching to PostgreSQL

```prisma
// apps/panel/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
DATABASE_URL="postgresql://spanel:secret@127.0.0.1:5432/spanel"
npm run db:push && npm run db:seed
```

---

## Security model

- `APP_KEY` drives AES-256-GCM encryption for node tokens, database-host passwords,
  SMTP credentials and DNS API tokens, plus session JWT signing.
  **Rotating it invalidates every stored secret.**
- Panel → daemon: `Bearer <tokenId>.<token>` **plus** an HMAC-SHA256 signature over
  the request body, so a captured request cannot be replayed with a modified payload.
- Daemon → panel (`/api/remote/*`): the same scheme in reverse. The node is looked
  up by `tokenId`, the token is compared in constant time, and the body HMAC is
  verified before the JSON is parsed. Server-scoped endpoints additionally refuse
  servers belonging to another node.
- Browser → daemon console: short-lived (10 min) JWT signed with the node token,
  scoped to one server and carrying the user's permissions.
- Every daemon file operation is confined to the server volume with symlink-aware
  path resolution; eggs can additionally denylist paths.
- Database provisioning validates identifiers against a strict allowlist, because
  MySQL cannot bind database/user names as parameters.
- Admin routes are gated in Edge middleware **and** re-checked server-side; the
  cookie role claim is never used as the authorisation source.

> **A node token grants full control over every server on its node.** Treat the
> generated config and install command as secrets — never paste them into a file
> you commit, an issue, or a screenshot. Rotate from Admin → Nodes if one leaks.

The panel intentionally has no public sign-up by default; enable it explicitly in
Admin → Site settings.

---

## Tests

```bash
npm run test:integration   # service layer against the configured database (155 checks)
npm run test:daemon        # daemon security + limits + vhost generation, no Docker (118 checks)
npm test                   # both
```

Against a running panel:

```bash
npm run build --workspace @spanel/panel
npm start --workspace @spanel/panel &

npm run test:smoke  -- http://127.0.0.1:3110   # HTTP flow: registration, session, every page (30 checks)
npm run test:remote -- http://127.0.0.1:3110   # daemon → panel remote API with real HMAC (11 checks)
```

`test:integration` writes and removes its own `itest*` fixtures and deliberately
points a node at a closed port to prove that a daemon outage still commits panel
state and surfaces the error. `test:smoke` registers the first admin, so run it
against an empty database. `test:remote` creates a throwaway node, sends a signed
heartbeat, pulls the node's own `config.yml`, then proves that bad signatures,
tampered bodies, foreign servers and unknown servers are all refused; it removes
the node afterwards and needs `DATABASE_URL` pointed at the same database the
running panel is using.

---

## Project layout

```
apps/panel/src/
├─ app/
│  ├─ (public)/                    marketing landing page
│  ├─ auth/{login,register}/       first-run admin + sign in
│  ├─ dashboard/                   client area
│  │  └─ servers/[server]/         console, files, databases, network, backups,
│  │                               startup, schedules, users, settings
│  ├─ admin/                       settings, users, nodes, allocations, domains,
│  │                               databases, servers, eggs, activity
│  └─ api/
│     ├─ remote/                   daemon → panel: heartbeat, node config,
│     │                            server spec/status/install, backups
│     └─ …                         health, resources proxy, console ticket
├─ components/{layout,ui}/         shell, tabs, cards, forms, meters, modal, toast
├─ lib/
│  ├─ auth/                        session, jwt (edge-safe), rbac
│  ├─ daemon/                      typed client, spec builder, token minting
│  ├─ i18n/                        en/ar messages, RTL, locale cookie
│  ├─ motion/                      GSAP + Three.js landing motion system
│  ├─ services/                    provisioning, capacity, networking, heartbeat,
│  │                               node-config, egg-io, db-health, cron
│  └─ activity.ts crypto.ts settings.ts databases.ts mail.ts validation.ts
├─ middleware.ts                   edge auth gate
└─ scripts/
   ├─ integration-test.ts          service-layer test
   ├─ remote-test.mts              daemon → panel remote API test
   └─ worker.ts                    background scheduler + node health reconciler

apps/daemon/src/
├─ index.ts                        HTTP API + routing + auth
├─ cli.ts                          install / configure / service / doctor
├─ server-manager.ts               lifecycle, console fan-out, quotas, stats
├─ docker.ts                       container creation and limit translation
├─ file-service.ts                 sandboxed file operations
├─ proxy-service.ts                nginx vhost generation (HTML/PHP/proxy)
├─ backup-service.ts               tar.gz snapshots
├─ console-gateway.ts              websocket console
├─ panel-client.ts heartbeat.ts    signed panel reporting + 15 s telemetry
└─ fs-safe.ts auth.ts config.ts    path guards, HMAC/JWT, YAML config
```

---

## Notes and limits

- SQLite has no enums or JSON columns, so those fields are `String` and validated in
  `src/lib/constants.ts` + Zod schemas. Switching to PostgreSQL keeps working
  without code changes.
- Certificate issuance is delegated to certbot on the node; the panel records intent
  (`httpsMode: auto`) and writes the vhost. Wildcard DNS makes new subdomains
  resolve instantly.
- Cloudflare DNS credentials are stored per domain and encrypted, ready for
  automatic record creation.
- Node health is recomputed when `/admin` or `/admin/nodes` is rendered, and
  heartbeat samples are trimmed to the newest 240 per node (≈1 h at 15 s). The
  optional background worker (`npm run worker --workspace @spanel/panel`) also
  reconciles `heartbeatStatus` on every tick, so a node that stopped beating is
  flagged offline without waiting for an admin page load.
- Signed requests cover the body only, with no timestamp or nonce, so an identical
  request can be replayed verbatim. Transport TLS is what prevents capture in the
  first place.
- Scheduled tasks are managed from the server's **Schedules** tab (cron fields,
  ordered command/power/backup tasks, run-now) and executed by the background
  worker, which runs due schedules through the same DaemonClient paths as the
  interactive UI. Next-run times are computed in UTC by
  `src/lib/services/cron.ts` (no npm dependency). Start the worker alongside
  `next start`; it is intentionally kept out of the Next.js request lifecycle.

---

## License

[MIT](LICENSE) © SadlyStudios
