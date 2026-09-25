import type { Metadata } from "next";
import { Activity } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, relativeTime } from "@/lib/utils";
import { AccountForms } from "./account-forms";
import { SecurityForms } from "./security-forms";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("dashboard.accountMetaTitle") };
}
export const dynamic = "force-dynamic";

function parseScopes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getT();

  const [sessions, activity, account, apiKeys] = await Promise.all([
    prisma.session.findMany({ where: { userId: user.id }, orderBy: { lastUsed: "desc" }, take: 10 }),
    prisma.activityLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { totpEnabled: true } }),
    prisma.apiKey.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader title={t("dashboard.accountTitle")} description={t("dashboard.accountDescription")} />

      <AccountForms
        user={{ firstName: user.firstName, lastName: user.lastName, email: user.email, username: user.username }}
      />

      <SecurityForms
        totpEnabled={account.totpEnabled}
        apiKeys={apiKeys.map((key) => ({
          id: key.id,
          identifier: key.identifier,
          memo: key.memo,
          permissions: parseScopes(key.permissions),
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
        }))}
      />

      <div className="mt-6 grid animate-in gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("dashboard.accountSessionsTitle")} description={t("dashboard.accountSessionsDescription")} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.accountColIp")}</th>
                  <th>{t("dashboard.accountColDevice")}</th>
                  <th>{t("dashboard.accountColLastUsed")}</th>
                  <th>{t("dashboard.accountColExpires")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="font-mono text-xs">{session.ip ?? "—"}</td>
                    <td className="max-w-56 truncate text-xs text-ink-muted">{session.userAgent ?? t("dashboard.accountUnknownDevice")}</td>
                    <td className="text-xs text-ink-dim">{relativeTime(session.lastUsed)}</td>
                    <td className="text-xs text-ink-dim">{formatDate(session.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("dashboard.accountActivityTitle")} description={t("dashboard.accountActivityDescription")} />
          {activity.length === 0 ? (
            <CardBody className="text-xs text-ink-dim">{t("dashboard.accountActivityEmpty")}</CardBody>
          ) : (
            <ul className="divide-y divide-line-soft">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                  <Activity className="size-3.5 shrink-0 text-ink-dim" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">{entry.event}</span>
                  <span className="shrink-0 text-ink-dim">{relativeTime(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
