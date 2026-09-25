"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Loader2,
  Pencil,
  Play,
  Plus,
  Power,
  Terminal,
  Trash2,
  Archive,
} from "lucide-react";
import {
  createScheduleAction,
  updateScheduleAction,
  deleteScheduleAction,
  toggleScheduleAction,
  runScheduleNowAction,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  reorderTasksAction,
} from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Field, FormError, Input, Select, Checkbox } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { describe, validateCron } from "@/lib/services/cron";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";
import type { Translator } from "@/lib/i18n/translate";

export interface TaskRow {
  id: number;
  sequenceId: number;
  action: string;
  payload: string;
  timeOffset: number;
  continueOnFailure: boolean;
}

export interface ScheduleRow {
  id: number;
  name: string;
  cronMinute: string;
  cronHour: string;
  cronDayMonth: string;
  cronMonth: string;
  cronDayWeek: string;
  isActive: boolean;
  onlyWhenOnline: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  tasks: TaskRow[];
}

const POWER_SIGNALS = ["start", "stop", "restart", "kill"] as const;

const TASK_ICON: Record<string, typeof Terminal> = {
  command: Terminal,
  power: Power,
  backup: Archive,
};

function taskSummary(task: TaskRow, t: Translator): string {
  switch (task.action) {
    case "command":
      return task.payload || t("dashboard.serverSchedNoCommand");
    case "power":
      return t("dashboard.serverSchedSendSignal", { signal: task.payload });
    case "backup":
      return task.payload ? t("dashboard.serverSchedBackupNamed", { name: task.payload }) : t("dashboard.serverSchedCreateBackup");
    default:
      return task.action;
  }
}

export function SchedulePanel({
  serverUuid,
  schedules,
  canManage,
}: {
  serverUuid: string;
  schedules: ScheduleRow[];
  canManage: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ mode: "create" } | { mode: "edit"; schedule: ScheduleRow } | null>(null);
  const [taskModal, setTaskModal] = useState<{ scheduleId: number; task: TaskRow | null } | null>(null);
  const { confirm, dialog } = useConfirm();
  const t = useT();

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setError(result.error ?? null);
    setNotice(result.message ?? null);
    setBusy(false);
    return result;
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Schedules"
          description="Run commands, power actions and backups automatically on a cron timetable."
          action={
            canManage ? (
              <Button onClick={() => setScheduleModal({ mode: "create" })}>
                <Plus className="size-3.5" />
                New schedule
              </Button>
            ) : null
          }
        />

        {error ? <div className="border-b border-bad/30 bg-bad/10 px-5 py-2 text-xs text-bad">{error}</div> : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}

        {schedules.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No schedules yet"
            description="Create a schedule to automate restarts, in-game commands or backups on a recurring timetable."
          />
        ) : (
          <CardBody className="space-y-4">
            {schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                serverUuid={serverUuid}
                schedule={schedule}
                canManage={canManage}
                busy={busy}
                act={act}
                confirm={confirm}
                onEdit={() => setScheduleModal({ mode: "edit", schedule })}
                onAddTask={() => setTaskModal({ scheduleId: schedule.id, task: null })}
                onEditTask={(task) => setTaskModal({ scheduleId: schedule.id, task })}
              />
            ))}
          </CardBody>
        )}
      </Card>

      {scheduleModal ? (
        <ScheduleModal
          serverUuid={serverUuid}
          initial={scheduleModal.mode === "edit" ? scheduleModal.schedule : null}
          busy={busy}
          error={error}
          onClose={() => setScheduleModal(null)}
          onSubmit={async (payload) => {
            const result = await act(() =>
              scheduleModal.mode === "edit"
                ? updateScheduleAction(serverUuid, scheduleModal.schedule.id, payload)
                : createScheduleAction(serverUuid, payload),
            );
            if (result.ok) setScheduleModal(null);
          }}
        />
      ) : null}

      {taskModal ? (
        <TaskModal
          initial={taskModal.task}
          busy={busy}
          error={error}
          onClose={() => setTaskModal(null)}
          onSubmit={async (payload) => {
            const result = await act(() =>
              taskModal.task
                ? updateTaskAction(serverUuid, taskModal.scheduleId, taskModal.task.id, payload)
                : createTaskAction(serverUuid, taskModal.scheduleId, payload),
            );
            if (result.ok) setTaskModal(null);
          }}
        />
      ) : null}

      {dialog}
    </>
  );
}

function ScheduleCard({
  serverUuid,
  schedule,
  canManage,
  busy,
  act,
  confirm,
  onEdit,
  onAddTask,
  onEditTask,
}: {
  serverUuid: string;
  schedule: ScheduleRow;
  canManage: boolean;
  busy: boolean;
  act: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => Promise<{ ok: boolean }>;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onEdit: () => void;
  onAddTask: () => void;
  onEditTask: (task: TaskRow) => void;
}) {
  const t = useT();
  const summary = describe({
    minute: schedule.cronMinute,
    hour: schedule.cronHour,
    dayMonth: schedule.cronDayMonth,
    month: schedule.cronMonth,
    dayWeek: schedule.cronDayWeek,
  });

  const moveTask = async (index: number, direction: -1 | 1) => {
    const ids = schedule.tasks.map((task) => task.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await act(() => reorderTasksAction(serverUuid, schedule.id, ids));
  };

  return (
    <div className="rounded-xl border border-line bg-surface-2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{schedule.name}</span>
            <Badge tone={schedule.isActive ? "ok" : "neutral"}>{schedule.isActive ? "active" : "paused"}</Badge>
            {schedule.onlyWhenOnline ? <Badge tone="info">only when online</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-ink-muted">{summary}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-dim">
            <span>Next run: {schedule.isActive ? formatDate(schedule.nextRunAt) : "paused"}</span>
            <span>Last run: {formatDate(schedule.lastRunAt)}</span>
            <span className="font-mono">
              {schedule.cronMinute} {schedule.cronHour} {schedule.cronDayMonth} {schedule.cronMonth} {schedule.cronDayWeek}
            </span>
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="Run now"
              disabled={busy || schedule.tasks.length === 0}
              onClick={() => act(() => runScheduleNowAction(serverUuid, schedule.id))}
              className="rounded p-1.5 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-40"
            >
              <Play className="size-3.5" />
            </button>
            <button
              type="button"
              title={schedule.isActive ? "Pause schedule" : "Activate schedule"}
              disabled={busy}
              onClick={() => act(() => toggleScheduleAction(serverUuid, schedule.id, !schedule.isActive))}
              className="rounded p-1.5 text-ink-dim hover:bg-surface-3 hover:text-ink"
            >
              <Power className="size-3.5" />
            </button>
            <button
              type="button"
              title="Edit schedule"
              disabled={busy}
              onClick={onEdit}
              className="rounded p-1.5 text-ink-dim hover:bg-surface-3 hover:text-ink"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              title="Delete schedule"
              disabled={busy}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: `Delete ${schedule.name}?`,
                    description: "The schedule and all of its tasks will be removed.",
                    tone: "danger",
                    confirmLabel: "Delete schedule",
                  }))
                )
                  return;
                await act(() => deleteScheduleAction(serverUuid, schedule.id));
              }}
              className="rounded p-1.5 text-ink-dim hover:bg-bad/15 hover:text-bad"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="px-4 py-3">
        {schedule.tasks.length === 0 ? (
          <p className="text-xs text-ink-dim">No tasks yet. Add a task to give this schedule something to do.</p>
        ) : (
          <ol className="space-y-1.5">
            {schedule.tasks.map((task, index) => {
              const Icon = TASK_ICON[task.action] ?? Terminal;
              return (
                <li key={task.id} className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-muted">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{taskSummary(task, t)}</span>
                    <span className="text-xs text-ink-dim">
                      {task.action}
                      {task.timeOffset > 0 ? ` · waits ${task.timeOffset}s` : ""}
                      {task.continueOnFailure ? " · continues on failure" : ""}
                    </span>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Move up"
                        disabled={busy || index === 0}
                        onClick={() => moveTask(index, -1)}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={busy || index === schedule.tasks.length - 1}
                        onClick={() => moveTask(index, 1)}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Edit task"
                        disabled={busy}
                        onClick={() => onEditTask(task)}
                        className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete task"
                        disabled={busy}
                        onClick={() => act(() => deleteTaskAction(serverUuid, schedule.id, task.id))}
                        className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {canManage ? (
          <button
            type="button"
            onClick={onAddTask}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"
          >
            <Plus className="size-3.5" />
            Add task
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleModal({
  serverUuid: _serverUuid,
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  serverUuid: string;
  initial: ScheduleRow | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    cronMinute: string;
    cronHour: string;
    cronDayMonth: string;
    cronMonth: string;
    cronDayWeek: string;
    isActive: boolean;
    onlyWhenOnline: boolean;
  }) => Promise<void>;
}) {
  const [fields, setFields] = useState({
    minute: initial?.cronMinute ?? "*/5",
    hour: initial?.cronHour ?? "*",
    dayMonth: initial?.cronDayMonth ?? "*",
    month: initial?.cronMonth ?? "*",
    dayWeek: initial?.cronDayWeek ?? "*",
  });
  const [name, setName] = useState(initial?.name ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [onlyWhenOnline, setOnlyWhenOnline] = useState(initial?.onlyWhenOnline ?? false);

  const validation = validateCron(fields);
  const preview = validation.ok ? describe(fields) : validation.error;

  const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit schedule" : "New schedule"}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="schedule-form" type="submit" loading={busy} disabled={!validation.ok}>
            {initial ? "Save changes" : "Create schedule"}
          </Button>
        </>
      }
    >
      <form
        id="schedule-form"
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit({
            name,
            cronMinute: fields.minute,
            cronHour: fields.hour,
            cronDayMonth: fields.dayMonth,
            cronMonth: fields.month,
            cronDayWeek: fields.dayWeek,
            isActive,
            onlyWhenOnline,
          });
        }}
      >
        <FormError message={error} />
        <Field label="Schedule name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly restart" required />
        </Field>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Minute">
            <Input value={fields.minute} onChange={set("minute")} className="font-mono" placeholder="*/5" />
          </Field>
          <Field label="Hour">
            <Input value={fields.hour} onChange={set("hour")} className="font-mono" placeholder="*" />
          </Field>
          <Field label="Day (month)">
            <Input value={fields.dayMonth} onChange={set("dayMonth")} className="font-mono" placeholder="*" />
          </Field>
          <Field label="Month">
            <Input value={fields.month} onChange={set("month")} className="font-mono" placeholder="*" />
          </Field>
          <Field label="Day (week)">
            <Input value={fields.dayWeek} onChange={set("dayWeek")} className="font-mono" placeholder="*" />
          </Field>
        </div>

        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            validation.ok ? "border-info/30 bg-info/10 text-info" : "border-bad/30 bg-bad/10 text-bad"
          }`}
        >
          {preview}
        </div>

        <Checkbox
          label="Active"
          description="Paused schedules keep their tasks but never run automatically."
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <Checkbox
          label="Only run when the server is online"
          description="Skip this run (and reschedule) if the server is not running."
          checked={onlyWhenOnline}
          onChange={(e) => setOnlyWhenOnline(e.target.checked)}
        />
      </form>
    </Modal>
  );
}

function TaskModal({
  initial,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  initial: TaskRow | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    action: string;
    payload: string;
    timeOffset: number;
    continueOnFailure: boolean;
  }) => Promise<void>;
}) {
  const [action, setAction] = useState(initial?.action ?? "command");
  const [payload, setPayload] = useState(initial?.payload ?? "");
  const [powerSignal, setPowerSignal] = useState(
    initial?.action === "power" && initial.payload ? initial.payload : "restart",
  );
  const [timeOffset, setTimeOffset] = useState(initial?.timeOffset ?? 0);
  const [continueOnFailure, setContinueOnFailure] = useState(initial?.continueOnFailure ?? false);

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit task" : "Add task"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button form="task-form" type="submit" loading={busy}>
            {initial ? "Save task" : "Add task"}
          </Button>
        </>
      }
    >
      <form
        id="task-form"
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const resolvedPayload =
            action === "power" ? powerSignal : action === "backup" ? payload.trim() : payload;
          await onSubmit({ action, payload: resolvedPayload, timeOffset, continueOnFailure });
        }}
      >
        <FormError message={error} />
        <Field label="Action">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="command">Send command</option>
            <option value="power">Power action</option>
            <option value="backup">Create backup</option>
          </Select>
        </Field>

        {action === "command" ? (
          <Field label="Command" hint="Sent to the server console, e.g. say Restarting in 5 minutes">
            <Input value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="save-all" required />
          </Field>
        ) : null}

        {action === "power" ? (
          <Field label="Power signal">
            <Select value={powerSignal} onChange={(e) => setPowerSignal(e.target.value)}>
              {POWER_SIGNALS.map((signal) => (
                <option key={signal} value={signal}>
                  {signal}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {action === "backup" ? (
          <Field label="Backup name" hint="Optional. Defaults to a timestamp.">
            <Input value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="nightly" />
          </Field>
        ) : null}

        <Field label="Time offset (seconds)" hint="Wait this long before running the task, e.g. after a warning command.">
          <Input
            type="number"
            min={0}
            max={900}
            value={timeOffset}
            onChange={(e) => setTimeOffset(Number(e.target.value))}
          />
        </Field>

        <Checkbox
          label="Continue on failure"
          description="Run the next task even if this one errors."
          checked={continueOnFailure}
          onChange={(e) => setContinueOnFailure(e.target.checked)}
        />
      </form>
    </Modal>
  );
}
