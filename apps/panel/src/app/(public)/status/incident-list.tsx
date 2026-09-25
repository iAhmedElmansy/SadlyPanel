import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  INCIDENT_IMPACT_LABELS,
  INCIDENT_STATUS_LABELS,
  type IncidentImpact,
  type IncidentStatus,
} from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export type PublicIncidentUpdate = { id: number; body: string; status: string; createdAt: string };
export type PublicIncident = {
  id: number;
  title: string;
  impact: string;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  updates: PublicIncidentUpdate[];
};

const IMPACT_TONE: Record<string, "warn" | "bad"> = { minor: "warn", major: "warn", critical: "bad" };

function statusTone(status: string): "ok" | "warn" | "info" | "bad" {
  if (status === "resolved") return "ok";
  if (status === "monitoring") return "info";
  if (status === "identified") return "warn";
  return "bad";
}

/** Renders a single incident with its update history. Server-rendered. */
export async function IncidentList({ incidents }: { incidents: PublicIncident[] }) {
  const t = await getT();
  return (
    <div className="space-y-4">
      {incidents.map((incident) => (
        <article key={incident.id} className="panel-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-ink">{incident.title}</h3>
              <p className="mt-1 text-xs text-ink-dim">
                {t("public.incidentStarted", { date: formatDate(incident.startedAt) })}
                {incident.resolvedAt
                  ? t("public.incidentResolvedSuffix", { date: formatDate(incident.resolvedAt) })
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={IMPACT_TONE[incident.impact] ?? "warn"}>
                {INCIDENT_IMPACT_LABELS[incident.impact as IncidentImpact] ?? incident.impact}
              </Badge>
              <Badge tone={statusTone(incident.status)}>
                {INCIDENT_STATUS_LABELS[incident.status as IncidentStatus] ?? incident.status}
              </Badge>
            </div>
          </div>

          {incident.updates.length > 0 ? (
            <ol className="mt-4 space-y-3 border-t border-line-soft pt-4">
              {incident.updates.map((update) => (
                <li key={update.id} className="flex gap-3 text-sm">
                  <span className="shrink-0 pt-0.5">
                    <Badge tone={statusTone(update.status)}>
                      {INCIDENT_STATUS_LABELS[update.status as IncidentStatus] ?? update.status}
                    </Badge>
                  </span>
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-ink-muted">{update.body}</p>
                    <p className="mt-0.5 text-xs text-ink-dim">{formatDate(update.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </article>
      ))}
    </div>
  );
}
