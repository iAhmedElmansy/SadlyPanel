"use client";

import { useState } from "react";
import { Globe2, Link2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { attachHostnameAction, detachHostnameAction, reapplyProxyAction, setPrimaryAllocationAction } from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n/preferences";

export interface AllocationRow {
  id: number;
  ip: string;
  ipAlias: string | null;
  port: number;
  isPrimary: boolean;
  notes: string | null;
}

export interface BindingRow {
  id: number;
  hostname: string;
  kind: string;
  httpsMode: string;
  forceHttps: boolean;
  targetPort: number | null;
  isPrimary: boolean;
  status: string;
  statusNote: string | null;
}

export interface DomainOption {
  id: number;
  name: string;
}

export function NetworkPanel({
  serverUuid,
  allocations,
  bindings,
  domains,
  serviceKind,
  canUpdate,
  nodeIp,
}: {
  serverUuid: string;
  allocations: AllocationRow[];
  bindings: BindingRow[];
  domains: DomainOption[];
  serviceKind: string;
  canUpdate: boolean;
  nodeIp: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"subdomain" | "custom">(domains.length ? "subdomain" : "custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const defaultKind = serviceKind === "webhost" ? "http" : serviceKind === "game" ? "minecraft" : "tcp";

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
      <div className="space-y-6">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}

        <Card>
          <CardHeader
            title={t("dashboard.hostnames")}
            description={t("dashboard.hostnamesDesc")}
            action={
              canUpdate ? (
                <div className="flex gap-2">
                  <Button variant="ghost" loading={busy} onClick={() => act(() => reapplyProxyAction(serverUuid))}>
                    <RefreshCw className="size-3.5" />
                    {t("dashboard.reapply")}
                  </Button>
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-3.5" />
                    {t("dashboard.attachHostname")}
                  </Button>
                </div>
              ) : null
            }
          />

          {bindings.length === 0 ? (
            <EmptyState
              icon={<Globe2 className="size-5" />}
              title={t("dashboard.noHostnameTitle")}
              description={t("dashboard.noHostnameDesc", { ip: nodeIp })}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>{t("dashboard.colHostname")}</th>
                    <th>{t("dashboard.colType")}</th>
                    <th>{t("dashboard.colHttps")}</th>
                    <th>{t("dashboard.colPort")}</th>
                    <th>{t("dashboard.colStatus")}</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((binding) => (
                    <tr key={binding.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          {binding.kind === "http" ? (
                            <a
                              href={`http${binding.forceHttps ? "s" : ""}://${binding.hostname}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-mono text-xs text-brand-soft hover:underline"
                            >
                              {binding.hostname}
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-ink">{binding.hostname}</span>
                          )}
                          {binding.isPrimary ? <Badge tone="brand">{t("dashboard.primary")}</Badge> : null}
                        </span>
                        {binding.statusNote ? <span className="block text-xs text-bad">{binding.statusNote}</span> : null}
                      </td>
                      <td className="text-xs text-ink-muted">{binding.kind}</td>
                      <td className="text-xs text-ink-muted">{binding.httpsMode}</td>
                      <td className="font-mono text-xs text-ink-muted">{binding.targetPort ?? "—"}</td>
                      <td>
                        <StatusBadge state={binding.status} />
                      </td>
                      <td>
                        {canUpdate ? (
                          <button
                            type="button"
                            title={t("dashboard.detachHostname")}
                            disabled={busy}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: t("dashboard.detachConfirmTitle", { hostname: binding.hostname }),
                                  description: t("dashboard.detachConfirmDesc"),
                                  tone: "danger",
                                  confirmLabel: t("dashboard.detach"),
                                }))
                              )
                                return;
                              await act(() => detachHostnameAction(serverUuid, binding.id));
                            }}
                            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t("dashboard.ports")} description={t("dashboard.portsDesc")} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t("dashboard.address")}</th>
                  <th>{t("dashboard.colNotes")}</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>
                      <span className="flex items-center gap-2 font-mono text-xs text-ink">
                        {allocation.ipAlias || allocation.ip}:{allocation.port}
                        {allocation.isPrimary ? <Badge tone="brand">{t("dashboard.primary")}</Badge> : null}
                      </span>
                    </td>
                    <td className="text-xs text-ink-dim">{allocation.notes ?? "—"}</td>
                    <td className="text-right">
                      {canUpdate && !allocation.isPrimary ? (
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => act(() => setPrimaryAllocationAction(serverUuid, allocation.id))}
                          className="px-2 py-1 text-xs"
                        >
                          <Star className="size-3" />
                          {t("dashboard.makePrimary")}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-line text-xs text-ink-dim">
            {t("dashboard.portsFooter")}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("dashboard.attachHostnameTitle")}
        description={t("dashboard.attachHostnameDesc")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="attach-hostname" type="submit" loading={busy}>
              <Link2 className="size-3.5" />
              {t("dashboard.attach")}
            </Button>
          </>
        }
      >
        <form
          id="attach-hostname"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const result = await act(() =>
              attachHostnameAction(serverUuid, {
                mode,
                domainId: data.get("domainId") ? Number(data.get("domainId")) : undefined,
                label: (data.get("label") as string) || undefined,
                hostname: (data.get("hostname") as string) || undefined,
                kind: String(data.get("kind") ?? defaultKind),
                httpsMode: String(data.get("httpsMode") ?? "auto"),
                forceHttps: data.get("forceHttps") === "on",
                targetPort: data.get("targetPort") ? Number(data.get("targetPort")) : null,
                isPrimary: data.get("isPrimary") === "on",
              }),
            );
            if (result.ok) setOpen(false);
          }}
        >
          <FormError message={error} />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={domains.length === 0}
              onClick={() => setMode("subdomain")}
              className={`btn ${mode === "subdomain" ? "btn-primary" : "btn-ghost"} ${domains.length === 0 ? "opacity-50" : ""}`}
            >
              {t("dashboard.managedSubdomain")}
            </button>
            <button type="button" onClick={() => setMode("custom")} className={`btn ${mode === "custom" ? "btn-primary" : "btn-ghost"}`}>
              {t("dashboard.myOwnDomain")}
            </button>
          </div>

          {mode === "subdomain" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("dashboard.subdomain")} required>
                <Input name="label" required placeholder="play" />
              </Field>
              <Field label={t("dashboard.domain")} required>
                <Select name="domainId" required>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      .{domain.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <Field label={t("dashboard.hostname")} required hint={t("dashboard.hostnameHint", { ip: nodeIp.split(":")[0] })}>
              <Input name="hostname" required placeholder="play.example.com" />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("dashboard.routingType")} required hint={t("dashboard.routingTypeHint")}>
              <Select name="kind" defaultValue={defaultKind}>
                <option value="http">{t("dashboard.routingHttp")}</option>
                <option value="minecraft">{t("dashboard.routingMinecraft")}</option>
                <option value="tcp">{t("dashboard.routingTcp")}</option>
              </Select>
            </Field>
            <Field label={t("dashboard.httpsLabel")} hint={t("dashboard.httpsHint")}>
              <Select name="httpsMode" defaultValue={defaultKind === "http" ? "auto" : "off"}>
                <option value="auto">{t("dashboard.httpsAuto")}</option>
                <option value="manual">{t("dashboard.httpsManual")}</option>
                <option value="off">{t("common.disabled")}</option>
              </Select>
            </Field>
          </div>

          <Field label={t("dashboard.targetPort")} hint={t("dashboard.targetPortHint")}>
            <Select name="targetPort" defaultValue="">
              <option value="">{t("dashboard.primaryPort")}</option>
              {allocations.map((allocation) => (
                <option key={allocation.id} value={allocation.port}>
                  {allocation.port}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2">
            <Checkbox name="forceHttps" defaultChecked={defaultKind === "http"} label={t("dashboard.redirectHttps")} />
            <Checkbox name="isPrimary" defaultChecked={bindings.length === 0} label={t("dashboard.usePrimaryAddress")} />
          </div>
        </form>
      </Modal>
      {dialog}
    </>
  );
}
