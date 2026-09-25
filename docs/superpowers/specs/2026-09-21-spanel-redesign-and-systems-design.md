# SPanel — Redesign + New Systems (Design Spec)

Status: approved direction (2026-09-21). Dark luxury Modern-SaaS visual language; fully customizable Roles.

## Scope (12 requests, grouped into waves)

1. Full internal SPA navigation, 100% Next.js/React, no runtime errors.
2. Fix `Cannot find module './383.js'` — DONE (cleared corrupted `.next` cache).
3. 100% new professional design: Landing, Dashboard, Admin (+ all sub-pages).
4. Use skills: frontend-design, ui-ux-pro-max, threejs-animation, frontend-ui-engineering.
5. Status page: real 100% monitoring (ping-based), categories, ordering, per-item enable/disable in admin, daily uptime bars (green/red/yellow), add items by link.
6. `/dashboard/servers` redesigned cards: type icon + full IP + CPU/RAM/Disk (with icons, live % of 100 and configured %), status bar (green=running, yellow=working, red=stopped). No wrapping box/background, no column-header text. Compact width.
7. Separate My Servers vs Web Hosting servers (no overlap).
8. Admin-only toggle on `/dashboard/servers`: "Showing your servers" ↔ "Showing others' servers"; gated by a permission editable in Roles.
9. Clickable sidebar Panel name: from admin → dashboard; from dashboard → landing.
10. Fix: admin pages — buttons don't work. — DONE (same corrupted `.next` cache as #2; verified fresh build: all chunks 200, hydration OK, `next build` exit 0. No code change; operational fix = `rm -rf .next`, keep agents out of `.next`).
11. Roles page: create/edit roles, edit each permission per role; every site feature is a permission; seed User/Admin/Support; 100% enforced server-side.
12. Run the site for testing.

## Standing constraints (from the user, still in force)
- IGNORE Windows entirely. Linux/Docker only.
- Additive only — extend structure, do not rewrite existing models destructively.
- One dedicated agent per task, disjoint files; orchestrator owns shared files.
- No fake functionality — every control has real backend + server-side permission checks.
- Design-system-driven: tokens in globals.css `@theme`; no ad-hoc colors.
- i18n is live (en/ar + RTL, dark/light theme). New UI must use `t()` and logical CSS classes (ms/me/ps/pe/start/end) and keep theme/lang decoupled. See memory `i18n-theme-architecture`.

## Design language — Dark luxury Modern SaaS
- Keep the existing dark `@theme` tokens as the base; refine with: deeper canvas, layered surfaces, subtle brand gradients, glass headers, refined borders/shadows, tighter type scale, calmer motion.
- Light theme override stays (`[data-theme="light"]`).
- Motion: quiet, purposeful (fade-rise, hover lifts). Three.js ONLY in the landing hero (progressive-enhanced, no layout shift, respects prefers-reduced-motion, no SSR hydration break).
- Shared primitives (components/ui/*) are the single source of truth; restyling a primitive updates every consumer.

## RBAC / Roles model (additive)
- New `Role` model: `{ id, key (unique, e.g. user/admin/support/custom-slug), name, description, permissions String (JSON array), isSystem Boolean, isDefault Boolean, sortOrder Int }`.
- `User` gains optional `roleId Int?` (SetNull) alongside the existing `role` string (keep string for back-compat; roleId is the new source of truth when present).
- Unify permission catalog: a single `PERMISSIONS` catalog in constants.ts grouped by area (server control, files, db, network, backup, schedule, settings, users, tickets, nodes, plans, servers.viewAll, servers.viewOthers, roles.manage, status.manage, etc.). Superset of STAFF_PERMISSIONS + new global ones. Keep SUBUSER_PERMISSIONS for per-server subusers.
- `staffCan()` / new `roleCan()` resolves from the user's Role.permissions (admin/rootAdmin implicitly all). Server-side enforcement in every action + middleware where relevant.
- Seed: User (baseline), Admin (all), Support (subset) as `isSystem` roles.
- Admin Roles page: list roles, create/edit/delete (block delete of system roles), permission matrix editor grouped by area.

## Status monitoring (additive, real)
- New models: `StatusCategory { id, name, sortOrder }`, extend/創 `StatusComponent { id, categoryId?, name, kind, monitorEnabled Boolean, monitorType (http|tcp|ping), monitorTarget (url/host:port), intervalSeconds, sortOrder }`, `StatusCheck { id, componentId, at, ok Boolean, latencyMs, statusCode? }` (rolling history), daily rollup for the bar chart.
- A worker/cron performs the actual checks (HTTP/TCP) on Linux; records StatusCheck; computes per-day up/down/partial. No fake data.
- Public status page renders category groups + 90-day uptime bars (green/red/yellow=partial) + current state + incidents.
- Admin status page: manage categories/components, toggle monitorEnabled per item, set target/type/interval, reorder.

## Server cards (Wave 3)
- Card: [type icon] name · full IP · CPU (live %, configured %), RAM, Disk each with icon; trailing vertical status bar (green/yellow/red). Compact, no outer box/bg, no header row.
- My Servers = servers of kind game/app owned by user (or others when toggle on). Web Hosting = kind web. Strict separation by service kind.
- Live stats via existing daemon client/telemetry; admin "show others" toggle gated by `servers.viewOthers` permission.

## Waves
- W1: RBAC/Roles backend + Roles admin page (DONE); fix admin buttons (DONE — cache, no code change); clickable Panel name (DONE); design-system foundation (NEXT).
- W2: redesign Landing (+three.js), Dashboard, Admin — one agent per area, on W1 design system.
- W3: server cards + my/web split + admin toggle; real status monitoring (models + worker + admin + public).
- W4: run site, fix runtime issues end-to-end.
