"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, FolderSymlink, MoreVertical, Play, RefreshCw, Server, Settings2, Trash2, UserCog } from "lucide-react";
import {
  adminDeleteServerAction,
  retryInstallAction,
  setServerMountAction,
  toggleSuspendServerAction,
  transferOwnerAction,
  updateServerBuildAction,
  type AdminServerState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DataTable, TableActions, type Column } from "@/components/ui/table";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { formatCpu, formatMib } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

const PAGE_SIZE = 15;

export type AdminServerRow = {
  id: number;
  uuid: string;
  uuidShort: string;
  name: string;
  ownerId: number;
  ownerName: string;
  nodeName: string;
  eggName: string;
  serviceKind: string;
  memory: number;
  swap: number;
  disk: number;
  cpu: number;
  io: number;
  threads: string | null;
  oomKiller: boolean;
  databaseLimit: number;
  allocationLimit: number;
  backupLimit: number;
  status: string;
  installStatus: string;
  suspended: boolean;
  address: string;
  attachedMountIds: number[];
  eligibleMounts: EligibleMount[];
}

export type EligibleMount = {
  id: number;
  name: string;
  source: string;
  target: string;
  readOnly: boolean;
};

export function AdminServerTable({
  servers,
  users,
}: {
  servers: AdminServerRow[];
  users: { id: number; username: string }[];
}) {
  const t = useT();
  const [buildState, buildAction] = useActionState<AdminServerState, FormData>(updateServerBuildAction, {});
  const [editing, setEditing] = useState<AdminServerRow | null>(null);
  const [transferring, setTransferring] = useState<AdminServerRow | null>(null);
  const [mounting, setMounting] = useState<AdminServerRow | null>(null);
  const [notice, setNotice] = useState<AdminServerState>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const { confirm, dialog } = useConfirm();

  const filtered = useMemo(() => {
    if (!query.trim()) return servers;
    const needle = query.toLowerCase();
    return servers.filter(
      (server) =>
        server.name.toLowerCase().includes(needle) ||
        server.ownerName.toLowerCase().includes(needle) ||
        server.uuidShort.includes(needle) ||
        server.nodeName.toLowerCase().includes(needle),
    );
  }, [servers, query]);

  const { page, setPage, pageCount, pageItems } = usePagination(filtered, PAGE_SIZE);

  const act = async (id: number, fn: () => Promise<AdminServerState>) => {
    setBusyId(id);
    setNotice(await fn());
    setBusyId(null);
  };

  const rowItems = (server: AdminServerRow): DropdownItem[] => {
    const items: DropdownItem[] = [];
    if (server.installStatus === "failed") {
      items.push({
        label: t("admin.stRetryInstall"),
        icon: <RefreshCw className="size-3.5" />,
        disabled: busyId === server.id,
        onSelect: () => void act(server.id, () => retryInstallAction(server.id)),
      });
    }
    items.push(
      { label: t("admin.stEditLimits"), icon: <Settings2 className="size-3.5" />, onSelect: () => setEditing(server) },
      { label: t("admin.stManageMounts"), icon: <FolderSymlink className="size-3.5" />, onSelect: () => setMounting(server) },
      { label: t("admin.stTransferOwner"), icon: <UserCog className="size-3.5" />, onSelect: () => setTransferring(server) },
      {
        label: server.suspended ? t("admin.stUnsuspend") : t("admin.stSuspend"),
        icon: server.suspended ? <Play className="size-3.5" /> : <Ban className="size-3.5" />,
        disabled: busyId === server.id,
        onSelect: () => void act(server.id, () => toggleSuspendServerAction(server.id)),
      },
      {
        label: t("admin.stDeleteServer"),
        icon: <Trash2 className="size-3.5" />,
        tone: "danger",
        disabled: busyId === server.id,
        onSelect: () => {
          void (async () => {
            if (
              !(await confirm({
                title: t("admin.stDeleteConfirmTitle", { name: server.name }),
                description: t("admin.stDeleteConfirmDesc"),
                tone: "danger",
                confirmLabel: t("admin.stDeleteServer"),
              }))
            )
              return;
            await act(server.id, () => adminDeleteServerAction(server.id));
          })();
        },
      },
    );
    return items;
  };

  const columns: Column<AdminServerRow>[] = [
    {
      key: "server",
      header: t("admin.stColServer"),
      render: (server) => (
        <div className="min-w-0">
          <Link
            href={`/dashboard/servers/${server.uuidShort}`}
            className="block truncate font-medium text-ink hover:text-brand-soft"
            title={server.name}
          >
            {server.name}
          </Link>
          <span className="block font-mono text-xs text-ink-dim">{server.uuidShort}</span>
          {/* Secondary fields collapse into this meta line once their columns are hidden. */}
          <span className="mt-0.5 block truncate text-xs text-ink-dim xl:hidden" title={`${server.ownerName} · ${server.nodeName} · ${server.eggName}`}>
            {server.ownerName} · {server.nodeName} · {server.eggName}
          </span>
        </div>
      ),
    },
    { key: "ownerName", header: t("admin.stColOwner"), className: "hidden text-xs text-ink-muted xl:table-cell" },
    { key: "nodeName", header: t("admin.stColNode"), className: "hidden text-xs text-ink-muted xl:table-cell" },
    { key: "eggName", header: t("admin.stColService"), className: "hidden text-xs text-ink-muted xl:table-cell" },
    {
      key: "limits",
      header: t("admin.stColLimits"),
      className: "hidden font-mono text-xs text-ink-muted md:table-cell",
      render: (server) => (
        <span className="whitespace-nowrap" title={t("admin.stLimitsTitle", { memory: formatMib(server.memory), disk: formatMib(server.disk), cpu: formatCpu(server.cpu) })}>
          {formatMib(server.memory)} · {formatMib(server.disk)} · {formatCpu(server.cpu)}
        </span>
      ),
    },
    {
      key: "address",
      header: t("admin.stColAddress"),
      className: "hidden font-mono text-xs text-ink-dim lg:table-cell",
      render: (server) => (
        <span className="block max-w-[18ch] truncate" title={server.address}>
          {server.address}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.stColStatus"),
      render: (server) => (
        <div className="flex flex-col gap-1">
          <StatusBadge state={server.suspended ? "suspended" : server.status} />
          {server.installStatus === "failed" ? <StatusBadge state="install_failed" /> : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (server) => (
        <TableActions>
          <Dropdown
            label={t("admin.stActionsFor", { name: server.name })}
            trigger={<span className="grid size-7 place-items-center rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"><MoreVertical className="size-4" /></span>}
            items={rowItems(server)}
          />
        </TableActions>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title={t("admin.stAllServers")}
          description={t("admin.stServerCount", { count: servers.length })}
          action={
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("admin.stSearchPlaceholder")}
                className="w-48"
                aria-label={t("admin.stSearchLabel")}
              />
              <Link href="/dashboard/servers/new" className="btn btn-primary">
                {t("admin.stNewServer")}
              </Link>
            </div>
          }
        />

        {notice.error ? (
          <CardBody className="border-b border-line-soft">
            <Alert tone="bad">{notice.error}</Alert>
          </CardBody>
        ) : null}
        {(notice.success || buildState.success) && (
          <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice.success ?? buildState.success}</div>
        )}

        <DataTable
          columns={columns}
          rows={pageItems}
          keyField="id"
          empty={<EmptyState icon={<Server className="size-5" />} title={t("admin.stNoServers")} description={t("admin.stNoServersDesc")} />}
        />

        {pageCount > 1 ? (
          <CardBody className="flex justify-end border-t border-line">
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </CardBody>
        ) : null}
      </Card>

      {dialog}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={t("admin.stLimitsModalTitle", { name: editing?.name ?? "" })}
        description={t("admin.stLimitsModalDesc")}
        width="lg"
      >
        {editing ? (
          <form action={buildAction} className="space-y-4">
            <input type="hidden" name="serverId" value={editing.id} />
            <FormError message={buildState.error} />
            <FormSuccess message={buildState.success} />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("admin.stMemory")} required>
                <Input name="memory" type="number" min={0} defaultValue={editing.memory} required />
              </Field>
              <Field label={t("admin.stDisk")} required>
                <Input name="disk" type="number" min={64} defaultValue={editing.disk} required />
              </Field>
              <Field label={t("admin.stCpu")} required>
                <Input name="cpu" type="number" min={0} max={6400} defaultValue={editing.cpu} required />
              </Field>
              <Field label={t("admin.stSwap")} hint={t("admin.stSwapHint")}>
                <Input name="swap" type="number" min={-1} defaultValue={editing.swap} />
              </Field>
              <Field label={t("admin.stBlockIo")} hint={t("admin.stBlockIoHint")}>
                <Input name="io" type="number" min={10} max={1000} defaultValue={editing.io} />
              </Field>
              <Field label={t("admin.stPinnedCores")}>
                <Input name="threads" defaultValue={editing.threads ?? ""} placeholder="0-2,4" />
              </Field>
              <Field label={t("admin.stDatabaseLimit")}>
                <Input name="databaseLimit" type="number" min={0} max={100} defaultValue={editing.databaseLimit} />
              </Field>
              <Field label={t("admin.stPortLimit")}>
                <Input name="allocationLimit" type="number" min={0} max={100} defaultValue={editing.allocationLimit} />
              </Field>
              <Field label={t("admin.stBackupLimit")}>
                <Input name="backupLimit" type="number" min={0} max={100} defaultValue={editing.backupLimit} />
              </Field>
            </div>

            <Checkbox name="oomKiller" defaultChecked={editing.oomKiller} label={t("admin.stOomKiller")} description={t("admin.stOomKillerDesc")} />

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                {t("common.close")}
              </Button>
              <SubmitButton pendingLabel={t("common.saving")}>{t("admin.stSaveLimits")}</SubmitButton>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={transferring !== null} onClose={() => setTransferring(null)} title={t("admin.stTransferTitle")}>
        {transferring ? (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const ownerId = Number(new FormData(event.currentTarget).get("ownerId"));
              const id = transferring.id;
              setTransferring(null);
              await act(id, () => transferOwnerAction(id, ownerId));
            }}
          >
            <Field label={t("admin.stNewOwner")} required>
              <Select name="ownerId" defaultValue={transferring.ownerId} required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setTransferring(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("admin.stTransfer")}</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={mounting !== null}
        onClose={() => setMounting(null)}
        title={t("admin.stMountsModalTitle", { name: mounting?.name ?? "" })}
        description={t("admin.stMountsModalDesc")}
        width="lg"
      >
        {mounting ? (
          <MountsPanel
            server={mounting}
            busy={busyId === mounting.id}
            onToggle={(mountId, attach) =>
              act(mounting.id, () => setServerMountAction(mounting.id, mountId, attach))
            }
          />
        ) : null}
      </Modal>
    </>
  );
}

function MountsPanel({
  server,
  busy,
  onToggle,
}: {
  server: AdminServerRow;
  busy: boolean;
  onToggle: (mountId: number, attach: boolean) => void | Promise<void>;
}) {
  const t = useT();
  const attached = new Set(server.attachedMountIds);

  if (server.eligibleMounts.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<FolderSymlink className="size-5" />}
          title={t("admin.stNoEligibleMounts")}
          description={t("admin.stNoEligibleMountsDesc")}
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line-soft">
      {server.eligibleMounts.map((mount) => {
        const isAttached = attached.has(mount.id);
        return (
          <li key={mount.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm text-ink">{mount.name}</p>
              <p className="truncate font-mono text-xs text-ink-dim" title={`${mount.source} → ${mount.target}`}>
                {mount.source} → {mount.target}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={mount.readOnly ? "neutral" : "warn"}>{mount.readOnly ? t("admin.stRo") : t("admin.stRw")}</Badge>
              <Button
                variant={isAttached ? "ghost" : "primary"}
                className="px-2.5 py-1 text-xs"
                disabled={busy}
                onClick={() => void onToggle(mount.id, !isAttached)}
              >
                {isAttached ? t("admin.stDetach") : t("admin.stAttach")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
