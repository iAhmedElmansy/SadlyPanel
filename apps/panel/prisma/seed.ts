/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const uuid = () => crypto.randomUUID();

interface VariableSeed {
  name: string;
  description: string;
  envVariable: string;
  defaultValue: string;
  userViewable?: boolean;
  userEditable?: boolean;
  rules?: string;
}

interface EggSeed {
  name: string;
  description: string;
  kind: "game" | "application" | "webhost";
  dockerImages: Record<string, string>;
  startup: string;
  configStop?: string;
  configFiles?: unknown;
  configStartup?: unknown;
  configLogs?: unknown;
  scriptContainer?: string;
  scriptEntry?: string;
  scriptInstall?: string;
  features?: string[];
  variables: VariableSeed[];
  sortOrder?: number;
}

interface NestSeed {
  name: string;
  description: string;
  icon: string;
  eggs: EggSeed[];
}

const JAVA_IMAGES = {
  "Java 21": "ghcr.io/pterodactyl/yolks:java_21",
  "Java 17": "ghcr.io/pterodactyl/yolks:java_17",
  "Java 11": "ghcr.io/pterodactyl/yolks:java_11",
  "Java 8": "ghcr.io/pterodactyl/yolks:java_8",
};

const NODE_IMAGES = {
  "Node 22": "ghcr.io/parkervcp/yolks:nodejs_22",
  "Node 20": "ghcr.io/parkervcp/yolks:nodejs_20",
  "Node 18": "ghcr.io/parkervcp/yolks:nodejs_18",
};

const MC_LOGS = { custom: false, location: "logs/latest.log" };

const nests: NestSeed[] = [
  {
    name: "Minecraft",
    description: "Java edition Minecraft servers with per-server RAM, disk and CPU limits.",
    icon: "minecraft",
    eggs: [
      {
        name: "Paper",
        description: "High performance Spigot fork. Recommended for most Minecraft servers.",
        kind: "game",
        dockerImages: JAVA_IMAGES,
        startup:
          'java -Xms128M -Xmx{{SERVER_MEMORY}}M -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}} nogui',
        configFiles: {
          "server.properties": {
            parser: "properties",
            find: { "server-ip": "0.0.0.0", "server-port": "{{server.build.default.port}}", "query.port": "{{server.build.default.port}}" },
          },
        },
        configStartup: { done: ")! For help, type " },
        configLogs: MC_LOGS,
        features: ["eula", "java_version", "pid_limit"],
        scriptInstall: `#!/bin/ash
# Downloads the latest Paper build for the requested Minecraft version.
apk add --no-cache curl jq
mkdir -p /mnt/server && cd /mnt/server
VERSION="\${MINECRAFT_VERSION}"
if [ -z "\${VERSION}" ] || [ "\${VERSION}" = "latest" ]; then
  VERSION=$(curl -sSL https://api.papermc.io/v2/projects/paper | jq -r '.versions[-1]')
fi
BUILD=$(curl -sSL "https://api.papermc.io/v2/projects/paper/versions/\${VERSION}" | jq -r '.builds[-1]')
JAR="paper-\${VERSION}-\${BUILD}.jar"
curl -sSL -o "\${SERVER_JARFILE}" "https://api.papermc.io/v2/projects/paper/versions/\${VERSION}/builds/\${BUILD}/downloads/\${JAR}"
echo "eula=true" > eula.txt
`,
        variables: [
          {
            name: "Server jar file",
            description: "Name of the server jarfile to run.",
            envVariable: "SERVER_JARFILE",
            defaultValue: "server.jar",
            rules: "required|string|max:40",
          },
          {
            name: "Minecraft version",
            description: 'Version to install, or "latest".',
            envVariable: "MINECRAFT_VERSION",
            defaultValue: "latest",
            rules: "required|string|max:20",
          },
          {
            name: "Max players",
            description: "Player slot limit.",
            envVariable: "MAX_PLAYERS",
            defaultValue: "20",
            rules: "required|numeric",
          },
        ],
        sortOrder: 1,
      },
      {
        name: "Vanilla",
        description: "Official Mojang Minecraft server.",
        kind: "game",
        dockerImages: JAVA_IMAGES,
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
        configFiles: {
          "server.properties": {
            parser: "properties",
            find: { "server-ip": "0.0.0.0", "server-port": "{{server.build.default.port}}" },
          },
        },
        configStartup: { done: ")! For help, type " },
        configLogs: MC_LOGS,
        features: ["eula", "java_version"],
        scriptInstall: `#!/bin/ash
apk add --no-cache curl jq
mkdir -p /mnt/server && cd /mnt/server
MANIFEST=https://launchermeta.mojang.com/mc/game/version_manifest.json
VERSION="\${VANILLA_VERSION}"
if [ -z "\${VERSION}" ] || [ "\${VERSION}" = "latest" ]; then
  VERSION=$(curl -sSL "\${MANIFEST}" | jq -r '.latest.release')
fi
URL=$(curl -sSL "\${MANIFEST}" | jq -r --arg V "\${VERSION}" '.versions[] | select(.id==$V) | .url')
JAR_URL=$(curl -sSL "\${URL}" | jq -r '.downloads.server.url')
curl -sSL -o "\${SERVER_JARFILE}" "\${JAR_URL}"
echo "eula=true" > eula.txt
`,
        variables: [
          { name: "Server jar file", description: "Jar to execute.", envVariable: "SERVER_JARFILE", defaultValue: "server.jar" },
          { name: "Minecraft version", description: 'Version or "latest".', envVariable: "VANILLA_VERSION", defaultValue: "latest" },
        ],
        sortOrder: 2,
      },
      {
        name: "Fabric",
        description: "Fabric mod loader server.",
        kind: "game",
        dockerImages: JAVA_IMAGES,
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
        configFiles: {
          "server.properties": { parser: "properties", find: { "server-ip": "0.0.0.0", "server-port": "{{server.build.default.port}}" } },
        },
        configStartup: { done: ")! For help, type " },
        configLogs: MC_LOGS,
        features: ["eula", "java_version"],
        scriptInstall: `#!/bin/ash
apk add --no-cache curl jq
mkdir -p /mnt/server && cd /mnt/server
curl -sSL -o "\${SERVER_JARFILE}" "https://meta.fabricmc.net/v2/versions/loader/\${MINECRAFT_VERSION}/\${FABRIC_VERSION}/1.0.1/server/jar"
echo "eula=true" > eula.txt
`,
        variables: [
          { name: "Server jar file", description: "Jar to execute.", envVariable: "SERVER_JARFILE", defaultValue: "fabric-server.jar" },
          { name: "Minecraft version", description: "Minecraft version.", envVariable: "MINECRAFT_VERSION", defaultValue: "1.21.1" },
          { name: "Fabric loader", description: "Fabric loader version.", envVariable: "FABRIC_VERSION", defaultValue: "0.16.5" },
        ],
        sortOrder: 3,
      },
      {
        name: "Forge",
        description: "Minecraft Forge modded server.",
        kind: "game",
        dockerImages: JAVA_IMAGES,
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
        configFiles: {
          "server.properties": { parser: "properties", find: { "server-ip": "0.0.0.0", "server-port": "{{server.build.default.port}}" } },
        },
        configStartup: { done: ")! For help, type " },
        configLogs: MC_LOGS,
        features: ["eula", "java_version"],
        scriptInstall: `#!/bin/ash
apk add --no-cache curl
mkdir -p /mnt/server && cd /mnt/server
echo "Place the Forge installer jar in the server directory, then reinstall or run the installer from the console."
echo "eula=true" > eula.txt
`,
        variables: [
          { name: "Server jar file", description: "Jar to execute.", envVariable: "SERVER_JARFILE", defaultValue: "server.jar" },
          { name: "Minecraft version", description: "Minecraft version.", envVariable: "MINECRAFT_VERSION", defaultValue: "1.20.1" },
          { name: "Forge version", description: "Forge build.", envVariable: "FORGE_VERSION", defaultValue: "47.3.0" },
        ],
        sortOrder: 4,
      },
      {
        name: "BungeeCord",
        description: "Proxy that joins multiple Minecraft servers together.",
        kind: "game",
        dockerImages: JAVA_IMAGES,
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}",
        configFiles: {
          "config.yml": { parser: "yaml", find: { "listeners[0].query_port": "{{server.build.default.port}}", "listeners[0].host": "0.0.0.0:{{server.build.default.port}}" } },
        },
        configStartup: { done: "Listening on " },
        configLogs: { custom: false, location: "proxy.log.0" },
        features: ["java_version"],
        scriptInstall: `#!/bin/ash
apk add --no-cache curl
mkdir -p /mnt/server && cd /mnt/server
curl -sSL -o "\${SERVER_JARFILE}" "https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar"
`,
        variables: [{ name: "Server jar file", description: "Jar to execute.", envVariable: "SERVER_JARFILE", defaultValue: "bungeecord.jar" }],
        sortOrder: 5,
      },
    ],
  },
  {
    name: "Applications",
    description: "Long-running application runtimes such as Node.js services and bots.",
    icon: "code",
    eggs: [
      {
        name: "Node.js Generic",
        description: "Runs any Node.js application from a git repository or uploaded files.",
        kind: "application",
        dockerImages: NODE_IMAGES,
        startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; {{PACKAGE_MANAGER}} install --production; {{STARTUP_CMD}}",
        configStop: "^C",
        configStartup: { done: "" },
        configLogs: { custom: true, location: "logs/latest.log" },
        scriptContainer: "ghcr.io/parkervcp/installers:debian",
        scriptEntry: "bash",
        scriptInstall: `#!/bin/bash
apt-get update -y && apt-get install -y git curl jq file unzip wget
mkdir -p /mnt/server && cd /mnt/server
if [ -n "\${GIT_REPO}" ]; then
  if [ -n "\${GIT_USERNAME}" ] && [ -n "\${GIT_TOKEN}" ]; then
    REPO=$(echo "\${GIT_REPO}" | sed "s#https://#https://\${GIT_USERNAME}:\${GIT_TOKEN}@#")
  else
    REPO="\${GIT_REPO}"
  fi
  git clone --depth 1 --branch "\${GIT_BRANCH:-main}" "\${REPO}" /mnt/server || echo "clone skipped"
fi
[ -f package.json ] || echo '{"name":"spanel-app","version":"1.0.0","main":"index.js","scripts":{"start":"node index.js"}}' > package.json
[ -f index.js ] || printf 'const http=require("http");\\nconst port=process.env.SERVER_PORT||3000;\\nhttp.createServer((_,res)=>{res.end("SPanel Node.js server is running\\\\n")}).listen(port,"0.0.0.0",()=>console.log("listening on "+port));\\n' > index.js
`,
        variables: [
          { name: "Startup command", description: "Command used to boot the app.", envVariable: "STARTUP_CMD", defaultValue: "npm start" },
          { name: "Package manager", description: "npm, yarn or pnpm.", envVariable: "PACKAGE_MANAGER", defaultValue: "npm" },
          { name: "Git repository", description: "Optional repository to deploy.", envVariable: "GIT_REPO", defaultValue: "" },
          { name: "Git branch", description: "Branch to check out.", envVariable: "GIT_BRANCH", defaultValue: "main" },
          { name: "Git username", description: "For private repositories.", envVariable: "GIT_USERNAME", defaultValue: "" },
          {
            name: "Git token",
            description: "Personal access token for private repositories.",
            envVariable: "GIT_TOKEN",
            defaultValue: "",
            userViewable: false,
          },
          { name: "Auto update", description: "Run git pull on boot (1/0).", envVariable: "AUTO_UPDATE", defaultValue: "0" },
        ],
        sortOrder: 1,
      },
      {
        name: "Node.js Discord Bot",
        description: "Node.js runtime tuned for discord.js bots.",
        kind: "application",
        dockerImages: NODE_IMAGES,
        startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; npm install --production; node {{BOT_JS_FILE}}",
        configStop: "^C",
        configStartup: { done: "" },
        scriptContainer: "ghcr.io/parkervcp/installers:debian",
        scriptEntry: "bash",
        scriptInstall: `#!/bin/bash
apt-get update -y && apt-get install -y git curl wget
mkdir -p /mnt/server && cd /mnt/server
[ -f package.json ] || echo '{"name":"discord-bot","version":"1.0.0","main":"index.js"}' > package.json
`,
        variables: [
          { name: "Bot entrypoint", description: "JS file to run.", envVariable: "BOT_JS_FILE", defaultValue: "index.js" },
          { name: "Git repository", description: "Optional repository to deploy.", envVariable: "GIT_REPO", defaultValue: "" },
          { name: "Auto update", description: "Run git pull on boot (1/0).", envVariable: "AUTO_UPDATE", defaultValue: "0" },
        ],
        sortOrder: 2,
      },
    ],
  },
  {
    name: "Web Hosting",
    description: "Static and PHP websites served through the node reverse proxy with custom domains.",
    icon: "globe",
    eggs: [
      {
        name: "Static HTML",
        description: "Nginx serving static HTML/CSS/JS from the public directory.",
        kind: "webhost",
        dockerImages: { "Nginx (Alpine)": "nginx:1.27-alpine" },
        startup: "nginx -g 'daemon off;'",
        configStop: "SIGQUIT",
        configStartup: { done: "start worker process" },
        configLogs: { custom: true, location: "logs/access.log" },
        scriptContainer: "ghcr.io/pterodactyl/installers:alpine",
        scriptEntry: "ash",
        scriptInstall: `#!/bin/ash
mkdir -p /mnt/server/public /mnt/server/logs
cd /mnt/server
if [ ! -f public/index.html ]; then
cat <<'HTML' > public/index.html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>It works</title></head>
<body style="font-family:system-ui;background:#0b0f1a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">
<main style="text-align:center"><h1>Your website is live</h1><p>Upload your files to <code>/public</code> to replace this page.</p></main>
</body></html>
HTML
fi
`,
        features: ["webhost"],
        variables: [
          { name: "Document root", description: "Directory served to visitors.", envVariable: "DOCUMENT_ROOT", defaultValue: "/public" },
          { name: "Index files", description: "Order of index files.", envVariable: "INDEX_FILES", defaultValue: "index.html index.htm" },
        ],
        sortOrder: 1,
      },
      {
        name: "PHP Website",
        description: "PHP-FPM + Nginx for WordPress, Laravel and classic PHP sites.",
        kind: "webhost",
        dockerImages: {
          "PHP 8.3": "ghcr.io/parkervcp/yolks:php_8.3",
          "PHP 8.2": "ghcr.io/parkervcp/yolks:php_8.2",
          "PHP 8.1": "ghcr.io/parkervcp/yolks:php_8.1",
        },
        startup: "php-fpm -F -y /home/container/php-fpm.conf",
        configStop: "SIGQUIT",
        configStartup: { done: "ready to handle connections" },
        configLogs: { custom: true, location: "logs/php-error.log" },
        scriptContainer: "ghcr.io/parkervcp/installers:debian",
        scriptEntry: "bash",
        scriptInstall: `#!/bin/bash
apt-get update -y && apt-get install -y curl unzip wget
mkdir -p /mnt/server/public /mnt/server/logs
cd /mnt/server
if [ ! -f public/index.php ]; then
  printf '<?php\\nphpinfo();\\n' > public/index.php
fi
`,
        features: ["webhost", "php"],
        variables: [
          { name: "Document root", description: "Directory served to visitors.", envVariable: "DOCUMENT_ROOT", defaultValue: "/public" },
          { name: "PHP version", description: "Runtime version.", envVariable: "PHP_VERSION", defaultValue: "8.3" },
          { name: "Memory limit", description: "PHP memory_limit.", envVariable: "PHP_MEMORY_LIMIT", defaultValue: "256M" },
          { name: "Upload max size", description: "upload_max_filesize.", envVariable: "PHP_UPLOAD_MAX", defaultValue: "64M" },
        ],
        sortOrder: 2,
      },
    ],
  },
];

async function seedNests() {
  for (const nestSeed of nests) {
    let nest = await prisma.nest.findFirst({ where: { name: nestSeed.name } });
    if (!nest) {
      nest = await prisma.nest.create({
        data: { uuid: uuid(), name: nestSeed.name, description: nestSeed.description, icon: nestSeed.icon },
      });
      console.log(`  + nest ${nest.name}`);
    }

    for (const eggSeed of nestSeed.eggs) {
      const existing = await prisma.egg.findFirst({ where: { nestId: nest.id, name: eggSeed.name } });
      const data = {
        nestId: nest.id,
        name: eggSeed.name,
        description: eggSeed.description,
        kind: eggSeed.kind,
        dockerImages: JSON.stringify(eggSeed.dockerImages),
        startup: eggSeed.startup,
        configFiles: JSON.stringify(eggSeed.configFiles ?? {}),
        configStartup: JSON.stringify(eggSeed.configStartup ?? {}),
        configStop: eggSeed.configStop ?? "^C",
        configLogs: JSON.stringify(eggSeed.configLogs ?? {}),
        scriptContainer: eggSeed.scriptContainer ?? "ghcr.io/pterodactyl/installers:alpine",
        scriptEntry: eggSeed.scriptEntry ?? "ash",
        scriptInstall: eggSeed.scriptInstall ?? "",
        features: JSON.stringify(eggSeed.features ?? []),
        sortOrder: eggSeed.sortOrder ?? 0,
      };

      const egg = existing
        ? await prisma.egg.update({ where: { id: existing.id }, data })
        : await prisma.egg.create({ data: { ...data, uuid: uuid() } });
      console.log(`    ${existing ? "~" : "+"} egg ${nest.name} / ${egg.name}`);

      for (const [index, variable] of eggSeed.variables.entries()) {
        await prisma.eggVariable.upsert({
          where: { eggId_envVariable: { eggId: egg.id, envVariable: variable.envVariable } },
          create: {
            eggId: egg.id,
            name: variable.name,
            description: variable.description,
            envVariable: variable.envVariable,
            defaultValue: variable.defaultValue,
            userViewable: variable.userViewable ?? true,
            userEditable: variable.userEditable ?? true,
            rules: variable.rules ?? "nullable|string",
            sortOrder: index,
          },
          update: {
            name: variable.name,
            description: variable.description,
            defaultValue: variable.defaultValue,
            userViewable: variable.userViewable ?? true,
            userEditable: variable.userEditable ?? true,
            rules: variable.rules ?? "nullable|string",
            sortOrder: index,
          },
        });
      }
    }
  }
}

async function seedSettings() {
  const defaults: Record<string, string> = {
    "site.name": "SPanel",
    "site.url": "https://spanel.sadlystudios.bond",
    "site.accent": "#6366f1",
    "site.description": "Game, application and web hosting control panel.",
    "site.registration_open": "false",
    "site.default_server_limit": "2",
    "mail.port": "587",
    "mail.encryption": "tls",
    "mail.from_name": "SPanel",
    "mail.enabled": "false",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.log("  ~ settings defaults ensured");
}

async function seedLocation() {
  const existing = await prisma.location.findFirst();
  if (existing) return;
  await prisma.location.create({ data: { shortCode: "default", name: "Default Location" } });
  console.log("  + location default");
}

interface PlanSeed {
  name: string;
  description: string;
  sortOrder: number;
  memory: number;
  disk: number;
  cpu: number;
  databaseLimit: number;
  allocationLimit: number;
  backupLimit: number;
}

const plans: PlanSeed[] = [
  { name: "Starter", description: "1 GB RAM, 5 GB disk, 1 core.", sortOrder: 1, memory: 1024, disk: 5120, cpu: 100, databaseLimit: 1, allocationLimit: 1, backupLimit: 2 },
  { name: "Standard", description: "2 GB RAM, 10 GB disk, 2 cores.", sortOrder: 2, memory: 2048, disk: 10240, cpu: 200, databaseLimit: 2, allocationLimit: 2, backupLimit: 3 },
  { name: "Performance", description: "4 GB RAM, 20 GB disk, 4 cores.", sortOrder: 3, memory: 4096, disk: 20480, cpu: 400, databaseLimit: 4, allocationLimit: 4, backupLimit: 5 },
];

async function seedPlans() {
  for (const planSeed of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: planSeed.name } });
    if (existing) continue;
    await prisma.plan.create({ data: planSeed });
    console.log(`  + plan ${planSeed.name}`);
  }
}

const statusComponents: { name: string; kind: string; sortOrder: number }[] = [
  { name: "Panel", kind: "panel", sortOrder: 1 },
  { name: "API", kind: "api", sortOrder: 2 },
];

async function seedStatusComponents() {
  for (const component of statusComponents) {
    const existing = await prisma.statusComponent.findFirst({ where: { name: component.name } });
    if (existing) continue;
    await prisma.statusComponent.create({ data: component });
    console.log(`  + status component ${component.name}`);
  }
}

/**
 * Unified permission catalog — mirrors PERMISSIONS in src/lib/constants.ts.
 * Duplicated here (as plain arrays) because the seed runs standalone via
 * ts-node and cannot import Next.js "@/..." path aliases.
 */
const ALL_PERMISSIONS = [
  "control.console", "control.start", "control.stop", "control.restart",
  "file.read", "file.write", "file.delete", "file.archive",
  "database.read", "database.create", "database.delete", "database.rotate",
  "network.read", "network.update",
  "backup.read", "backup.create", "backup.delete", "backup.restore",
  "schedule.read", "schedule.update",
  "settings.rename", "settings.reinstall", "user.read", "user.create", "user.delete",
  "users.view", "users.manage",
  "tickets.view", "tickets.reply", "tickets.manage",
  "servers.view", "servers.manage", "servers.viewOthers",
  "nodes.view", "plans.manage", "roles.manage", "status.manage",
];

interface RoleSeed {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isDefault: boolean;
  sortOrder: number;
}

const roles: RoleSeed[] = [
  {
    key: "admin",
    name: "Administrator",
    description: "Full access to every panel feature and setting.",
    permissions: ALL_PERMISSIONS,
    isSystem: true,
    isDefault: false,
    sortOrder: 1,
  },
  {
    key: "support",
    name: "Support",
    description: "Handles support tickets and can view users and servers.",
    permissions: ["tickets.view", "tickets.reply", "tickets.manage", "users.view", "servers.view"],
    isSystem: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    key: "user",
    name: "User",
    description: "Baseline account. Manages only their own servers.",
    permissions: [],
    isSystem: true,
    isDefault: true,
    sortOrder: 3,
  },
];

async function seedRoles() {
  const byKey: Record<string, number> = {};
  for (const roleSeed of roles) {
    const role = await prisma.role.upsert({
      where: { key: roleSeed.key },
      create: {
        key: roleSeed.key,
        name: roleSeed.name,
        description: roleSeed.description,
        permissions: JSON.stringify(roleSeed.permissions),
        isSystem: roleSeed.isSystem,
        isDefault: roleSeed.isDefault,
        sortOrder: roleSeed.sortOrder,
      },
      // Keep system roles' identity/permissions in sync on reseed, but never
      // wipe an admin down to nothing.
      update: {
        name: roleSeed.name,
        description: roleSeed.description,
        permissions: JSON.stringify(roleSeed.permissions),
        isSystem: roleSeed.isSystem,
        isDefault: roleSeed.isDefault,
        sortOrder: roleSeed.sortOrder,
      },
    });
    byKey[roleSeed.key] = role.id;
    console.log(`  ~ role ${role.key}`);
  }

  // Backfill: assign existing users a roleId matching their legacy role string
  // when they don't have one yet. Unknown role strings fall back to "user".
  const unassigned = await prisma.user.findMany({ where: { roleId: null }, select: { id: true, role: true } });
  for (const user of unassigned) {
    const roleId = byKey[user.role] ?? byKey["user"];
    if (roleId == null) continue;
    await prisma.user.update({ where: { id: user.id }, data: { roleId } });
  }
  if (unassigned.length > 0) console.log(`  ~ assigned roleId to ${unassigned.length} existing user(s)`);
}

async function main() {
  console.log("SPanel seed");
  await seedSettings();
  await seedLocation();
  await seedRoles();
  await seedNests();
  await seedPlans();
  await seedStatusComponents();
  const users = await prisma.user.count();
  console.log(
    users === 0
      ? "\nNo users yet — open /auth/register to create the first administrator."
      : `\n${users} user(s) already exist; registration is locked to admins.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
