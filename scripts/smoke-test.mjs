/**
 * SPanel runtime smoke test.
 * Exercises first-run registration, session cookie issuance, dashboard/admin
 * access, the signed daemon remote API, logout and login (by username and by
 * email) against a running panel.
 *
 * Usage: node scripts/smoke-test.mjs [baseUrl]
 */

const BASE = (process.argv[2] ?? "http://127.0.0.1:3111").replace(/\/+$/, "");

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Minimal cookie jar. */
class Jar {
  constructor() {
    this.cookies = new Map();
  }
  absorb(response) {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(";");
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === "" || /Expires=Thu, 01 Jan 1970/i.test(entry)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  has(name) {
    return this.cookies.has(name);
  }
}

async function get(path, jar, redirect = "manual") {
  const response = await fetch(`${BASE}${path}`, {
    redirect,
    headers: jar?.header() ? { cookie: jar.header() } : {},
  });
  if (jar) jar.absorb(response);
  return response;
}

/** Extracts the hidden fields Next.js needs to invoke a server action. */
function actionFields(html) {
  const fields = {};
  for (const match of html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/>/g)) {
    const name = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const value = (match[2] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    fields[name] = value;
  }
  return fields;
}

async function postAction(path, jar, html, payload) {
  // Server actions rendered by Next use multipart/form-data, so the fields must
  // be sent as FormData rather than urlencoded.
  const body = new FormData();
  for (const [key, value] of Object.entries(actionFields(html))) body.append(key, value);
  for (const [key, value] of Object.entries(payload)) body.append(key, value);

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      // Next.js validates the origin of server action requests.
      origin: BASE,
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    body,
  });
  jar.absorb(response);
  return response;
}

const ADMIN = {
  firstName: "Sadly",
  lastName: "Studios",
  username: "sadlyadmin",
  email: "admin@sadlystudios.bond",
  password: "SPanelAdmin123",
};

async function main() {
  console.log(`SPanel smoke test → ${BASE}\n`);

  // 1. health
  const health = await get("/api/health");
  const healthBody = await health.json();
  check("health endpoint reports ok", health.status === 200 && healthBody.status === "ok", `firstRun=${healthBody.firstRun}`);

  // 2. unauthenticated gating
  const dashboardAnon = await get("/dashboard");
  check(
    "unauthenticated /dashboard redirects to login",
    dashboardAnon.status === 307 && (dashboardAnon.headers.get("location") ?? "").includes("/auth/login"),
    dashboardAnon.headers.get("location") ?? "",
  );

  const adminAnon = await get("/admin");
  check(
    "unauthenticated /admin redirects to login",
    adminAnon.status === 307 && (adminAnon.headers.get("location") ?? "").includes("/auth/login"),
    adminAnon.headers.get("location") ?? "",
  );

  const firstRun = healthBody.firstRun === true;
  if (firstRun) {
    const loginRedirect = await get("/auth/login");
    check(
      "first run: /auth/login redirects to /auth/register",
      loginRedirect.status === 307 && loginRedirect.headers.get("location") === "/auth/register",
      loginRedirect.headers.get("location") ?? "",
    );
  }

  // 3. registration
  const jar = new Jar();
  const registerPage = await get("/auth/register", jar);
  const registerHtml = await registerPage.text();
  check("register page renders", registerPage.status === 200 && registerHtml.includes("Create the administrator account"));

  if (firstRun) {
    const registered = await postAction("/auth/register", jar, registerHtml, {
      firstName: ADMIN.firstName,
      lastName: ADMIN.lastName,
      username: ADMIN.username,
      email: ADMIN.email,
      password: ADMIN.password,
      passwordConfirm: ADMIN.password,
    });
    const location = registered.headers.get("x-action-redirect") ?? registered.headers.get("location") ?? "";
    check(
      "first admin registration succeeds and redirects to /admin",
      registered.status < 400 && location.includes("/admin"),
      `status=${registered.status} redirect=${location}`,
    );
    check("session cookie issued on registration", jar.has("spanel_session"));
  }

  // 4. authenticated access
  const dashboard = await get("/dashboard", jar);
  const dashboardHtml = dashboard.status === 200 ? await dashboard.text() : "";
  check(
    "authenticated /dashboard renders",
    dashboard.status === 200 && dashboardHtml.includes(`Welcome back, ${ADMIN.firstName}`),
    `status=${dashboard.status}`,
  );

  const admin = await get("/admin", jar);
  const adminHtml = admin.status === 200 ? await admin.text() : "";
  check(
    "authenticated /admin renders with setup checklist",
    admin.status === 200 && adminHtml.includes("Setup checklist"),
    `status=${admin.status}`,
  );

  const pages = [
    ["/admin/settings", "Site settings"],
    ["/admin/users", "Users"],
    ["/admin/nodes", "Nodes"],
    ["/admin/allocations", "Ports"],
    ["/admin/domains", "Domains and subdomains"],
    ["/admin/databases", "Database hosts"],
    ["/admin/servers", "All servers"],
    ["/admin/eggs", "Services"],
    ["/admin/activity", "Audit log"],
    ["/dashboard/servers", "My servers"],
    ["/dashboard/servers/new", "Create a server"],
    ["/dashboard/account", "Account settings"],
  ];
  for (const [path, needle] of pages) {
    const response = await get(path, jar);
    const html = response.status === 200 ? await response.text() : "";
    check(`${path} renders`, response.status === 200 && html.includes(needle), `status=${response.status}`);
  }

  // 4b. the daemon remote API rejects unsigned and unknown callers
  const remoteAnon = await fetch(`${BASE}/api/remote/nodes/heartbeat`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  check(
    "remote heartbeat rejects a request without credentials",
    remoteAnon.status === 401,
    `status=${remoteAnon.status}`,
  );

  const remoteBadToken = await fetch(`${BASE}/api/remote/nodes/heartbeat`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer deadbeef.not-a-real-token",
      "x-spanel-signature": "0".repeat(64),
    },
    body: "{}",
  });
  check(
    "remote heartbeat rejects an unknown node token",
    remoteBadToken.status === 403,
    `status=${remoteBadToken.status}`,
  );

  const remoteConfigAnon = await fetch(`${BASE}/api/remote/nodes/config`, { redirect: "manual" });
  check(
    "remote node config requires credentials",
    remoteConfigAnon.status === 401,
    `status=${remoteConfigAnon.status}`,
  );

  // 4c. the Node.js installer assets are published
  for (const asset of ["/install/daemon.sh", "/install/daemon.mjs"]) {
    const response = await get(asset);
    const body = response.status === 200 ? await response.text() : "";
    check(
      `${asset} is served`,
      response.status === 200 && body.length > 500,
      `status=${response.status} bytes=${body.length}`,
    );
  }

  // 5. seeded services visible in the wizard
  const wizard = await get("/dashboard/servers/new", jar);
  const wizardHtml = await wizard.text();
  const hasServices = ["Paper", "Node.js Generic", "Static HTML", "PHP Website"].every((name) =>
    wizardHtml.includes(name),
  );
  check("create-server wizard lists seeded services", hasServices);

  // 6. re-registration is locked once an admin exists
  const secondRegister = await get("/auth/register", new Jar());
  const secondHtml = await secondRegister.text();
  check("registration closed after first admin", secondHtml.includes("Registration is closed"));

  // 7. login by username, then by email
  for (const identity of [ADMIN.username, ADMIN.email]) {
    const freshJar = new Jar();
    const loginPage = await get("/auth/login", freshJar);
    const loginHtml = await loginPage.text();
    if (!loginHtml.includes("Sign in")) {
      check(`login page renders for ${identity}`, false, `status=${loginPage.status}`);
      continue;
    }
    const loggedIn = await postAction("/auth/login", freshJar, loginHtml, {
      identity,
      password: ADMIN.password,
    });
    const location = loggedIn.headers.get("x-action-redirect") ?? loggedIn.headers.get("location") ?? "";
    check(
      `login with ${identity.includes("@") ? "email" : "username"} succeeds`,
      loggedIn.status < 400 && freshJar.has("spanel_session") && location.includes("/dashboard"),
      `status=${loggedIn.status} redirect=${location}`,
    );

    const authed = await get("/dashboard", freshJar);
    check(`session from ${identity.includes("@") ? "email" : "username"} login works`, authed.status === 200);
  }

  // 8. wrong password is rejected
  const badJar = new Jar();
  const badLoginPage = await get("/auth/login", badJar);
  const badLoginHtml = await badLoginPage.text();
  const badLogin = await postAction("/auth/login", badJar, badLoginHtml, {
    identity: ADMIN.username,
    password: "definitely-wrong",
  });
  const badText = await badLogin.text();
  check(
    "wrong password is rejected without a session",
    !badJar.has("spanel_session") && badText.includes("do not match our records"),
  );

  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exitCode = 1;
});
