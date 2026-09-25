import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { STATUS_COMPONENT_KIND_LABELS, type StatusComponentKind } from "@/lib/constants";
import { getPublicStatus, type ComponentState } from "@/lib/services/status-monitor";
import { getT } from "@/lib/i18n/server";
import { IncidentList, type PublicIncident } from "./incident-list";
import { UptimeBars } from "./uptime-bars";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("public.metaStatus") };
}
export const dynamic = "force-dynamic";

function mapIncident(i: {
  id: number;
  title: string;
  impact: string;
  status: string;
  startedAt: Date;
  resolvedAt: Date | null;
  updates: { id: number; body: string; status: string; createdAt: Date }[];
}): PublicIncident {
  return {
    id: i.id,
    title: i.title,
    impact: i.impact,
    status: i.status,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    updates: i.updates.map((u) => ({ id: u.id, body: u.body, status: u.status, createdAt: u.createdAt.toISOString() })),
  };
}

type BadgeTone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand";

/** Maps a component's monitored state to a badge tone + i18n label key. */
function stateBadge(state: ComponentState | "unknown"): { tone: BadgeTone; key: string } {
  switch (state) {
    case "up":
      return { tone: "ok", key: "public.stateUp" };
    case "down":
      return { tone: "bad", key: "public.stateDown" };
    case "degraded":
      return { tone: "warn", key: "public.stateDegraded" };
    default:
      return { tone: "neutral", key: "public.stateUnknown" };
  }
}

export default async function StatusPage() {
  const t = await getT();
  const [groups, active, resolved] = await Promise.all([
    getPublicStatus(),
    prisma.incident.findMany({
      where: { status: { not: "resolved" } },
      orderBy: [{ startedAt: "desc" }],
      include: { updates: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.incident.findMany({
      where: { status: "resolved" },
      orderBy: [{ resolvedAt: "desc" }],
      take: 10,
      include: { updates: { orderBy: { createdAt: "desc" } } },
    }),
  ]);

  const allComponents = groups.flatMap((g) => g.components);
  const hasComponents = allComponents.length > 0;

  // Overall state combines live monitoring with open incidents. A monitored
  // outage or a critical incident is a hard "major outage"; any degraded probe
  // or open incident is "degraded"; otherwise everything is operational.
  const anyDown = allComponents.some((c) => c.state === "down");
  const anyDegraded = allComponents.some((c) => c.state === "degraded");
  const hasCritical = active.some((i) => i.impact === "critical");
  const degraded = anyDown || anyDegraded || active.length > 0;

  const overall = degraded
    ? {
        tone: "warn" as const,
        icon: anyDown || hasCritical ? AlertTriangle : CircleDot,
        label: anyDown || hasCritical ? t("public.majorOutage") : t("public.degradedPerformance"),
      }
    : { tone: "ok" as const, icon: CheckCircle2, label: t("public.allSystemsOperational") };

  const OverallIcon = overall.icon;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{t("public.statusTitle")}</h1>

      {/* Overall banner */}
      <div
        className={cn(
          "animate-in mt-6 flex items-center gap-3 rounded-lg border p-5",
          overall.tone === "ok" ? "breathe border-ok/40 bg-ok/10" : "border-warn/40 bg-warn/10",
        )}
      >
        <OverallIcon className={cn("size-6 shrink-0", overall.tone === "ok" ? "text-ok" : "text-warn")} />
        <div>
          <p className={cn("text-base font-semibold", overall.tone === "ok" ? "text-ok" : "text-warn")}>{overall.label}</p>
          <p className="text-xs text-ink-dim">
            {active.length > 0
              ? t(active.length === 1 ? "public.activeIncidentsTrackedOne" : "public.activeIncidentsTrackedOther", {
                  count: active.length,
                })
              : t("public.runningNormally")}
          </p>
        </div>
      </div>

      {/* Components grouped by category, each with 90-day uptime bars */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-dim">{t("public.components")}</h2>
        {!hasComponents ? (
          <div className="panel-card mt-4">
            <EmptyState
              icon={<CircleDot className="size-5" />}
              title={t("public.noComponents")}
              description={t("public.noComponentsDesc")}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((group) => (
              <div key={group.id ?? "uncategorised"}>
                {group.name || groups.length > 1 ? (
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {group.name ?? t("public.uncategorised")}
                  </h3>
                ) : null}
                <div className="panel-card divide-y divide-line-soft">
                  {group.components.map((component) => {
                    const badge = stateBadge(component.state);
                    return (
                      <div key={component.id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{component.name}</p>
                            <p className="text-xs text-ink-dim">
                              {STATUS_COMPONENT_KIND_LABELS[component.kind as StatusComponentKind] ?? component.kind}
                              {component.uptime90 !== null ? ` · ${t("public.uptime90", { percent: String(component.uptime90) })}` : ""}
                            </p>
                          </div>
                          <Badge tone={badge.tone}>
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                            {t(badge.key)}
                          </Badge>
                        </div>
                        {/* Only monitored components have a meaningful history. */}
                        {component.monitorEnabled ? (
                          <div className="mt-3">
                            <UptimeBars days={component.days} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active incidents */}
      {active.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-dim">{t("public.activeIncidents")}</h2>
          <div className="mt-4">
            <IncidentList incidents={active.map(mapIncident)} />
          </div>
        </section>
      ) : null}

      {/* History */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-dim">{t("public.recentHistory")}</h2>
        {resolved.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{t("public.noResolvedIncidents")}</p>
        ) : (
          <div className="mt-4">
            <IncidentList incidents={resolved.map(mapIncident)} />
          </div>
        )}
      </section>
    </div>
  );
}
