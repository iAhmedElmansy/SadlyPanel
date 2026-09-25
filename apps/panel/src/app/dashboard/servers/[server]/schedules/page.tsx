import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";
import { SchedulePanel, type ScheduleRow } from "./schedule-panel";

export const dynamic = "force-dynamic";

export default async function ServerSchedulesPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);
  const t = await getT();

  if (!can(access, "schedule.read")) {
    return (
      <Card>
        <CardHeader title={t("dashboard.serverSchedNoAccessTitle")} />
        <CardBody className="text-sm text-ink-muted">
          {t("dashboard.serverSchedNoAccessDesc")}
        </CardBody>
      </Card>
    );
  }

  const schedules = await prisma.schedule.findMany({
    where: { serverId: server.id },
    include: { tasks: { orderBy: { sequenceId: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  const rows: ScheduleRow[] = schedules.map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    cronMinute: schedule.cronMinute,
    cronHour: schedule.cronHour,
    cronDayMonth: schedule.cronDayMonth,
    cronMonth: schedule.cronMonth,
    cronDayWeek: schedule.cronDayWeek,
    isActive: schedule.isActive,
    onlyWhenOnline: schedule.onlyWhenOnline,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
    tasks: schedule.tasks.map((task) => ({
      id: task.id,
      sequenceId: task.sequenceId,
      action: task.action,
      payload: task.payload,
      timeOffset: task.timeOffset,
      continueOnFailure: task.continueOnFailure,
    })),
  }));

  return (
    <SchedulePanel
      serverUuid={server.uuidShort}
      schedules={rows}
      canManage={can(access, "schedule.update")}
    />
  );
}
