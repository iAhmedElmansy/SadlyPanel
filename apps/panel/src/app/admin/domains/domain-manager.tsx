"use client";

import { useActionState, useState } from "react";
import { Globe2, Link2, Plus, Trash2 } from "lucide-react";
import {
  createDomainAction,
  createSubdomainAction,
  deleteDomainAction,
  deleteSubdomainAction,
  type DomainState,
} from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, SubmitButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { useT } from "@/lib/i18n/preferences";

export interface DomainRow {
  id: number;
  name: string;
  nodeName: string | null;
  isPublic: boolean;
  wildcardDns: boolean;
  targetIp: string | null;
  dnsProvider: string;
  subdomains: {
    id: number;
    label: string;
    recordType: string;
    serverName: string | null;
    status: string;
  }[];
  bindingCount: number;
}

export function DomainManager({
  domains,
  nodes,
  servers,
}: {
  domains: DomainRow[];
  nodes: { id: number; name: string }[];
  servers: { id: number; name: string; uuidShort: string }[];
}) {
  const t = useT();
  const [domainState, domainAction] = useActionState<DomainState, FormData>(createDomainAction, {});
  const [subdomainState, subdomainAction] = useActionState<DomainState, FormData>(createSubdomainAction, {});
  const [domainOpen, setDomainOpen] = useState(false);
  const [subdomainDomainId, setSubdomainDomainId] = useState<number | null>(null);
  const [notice, setNotice] = useState<DomainState>({});
  const [provider, setProvider] = useState("manual");
  const { confirm, dialog } = useConfirm();

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setDomainOpen(true)}>
          <Plus className="size-3.5" />
          {t("admin.dmAddDomain")}
        </Button>
      </div>

      {notice.error ? <Alert tone="bad" className="mb-4">{notice.error}</Alert> : null}
      {notice.success ? <div className="mb-4 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{notice.success}</div> : null}
      {subdomainState.success ? (
        <div className="mb-4 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{subdomainState.success}</div>
      ) : null}

      {domains.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Globe2 className="size-5" />}
            title={t("admin.dmNoDomains")}
            description={t("admin.dmNoDomainsDesc")}
            action={
              <Button onClick={() => setDomainOpen(true)}>
                <Plus className="size-3.5" />
                {t("admin.dmAddFirstDomain")}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <Card key={domain.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{domain.name}</span>
                    {domain.isPublic ? <Badge tone="ok">{t("admin.dmPublic")}</Badge> : <Badge tone="neutral">{t("admin.dmPrivate")}</Badge>}
                    {domain.wildcardDns ? <Badge tone="info">{t("admin.dmWildcardDns")}</Badge> : null}
                    <Badge tone="neutral">{domain.dnsProvider}</Badge>
                  </span>
                }
                description={
                  <span className="text-xs">
                    {domain.nodeName ? t("admin.dmNodeLabel", { name: domain.nodeName }) : t("admin.dmAnyNode")}
                    {domain.targetIp ? t("admin.dmTarget", { ip: domain.targetIp }) : ""} · {t("admin.dmSummary", { subdomains: domain.subdomains.length, bindings: domain.bindingCount })}
                  </span>
                }
                action={
                  <div className="flex gap-1.5">
                    <Button variant="ghost" onClick={() => setSubdomainDomainId(domain.id)} className="px-2 py-1 text-xs">
                      <Link2 className="size-3" />
                      {t("admin.dmAddSubdomain")}
                    </Button>
                    <button
                      type="button"
                      title={t("admin.dmDeleteDomain")}
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: t("admin.dmDeleteDomainTitle", { name: domain.name }),
                            description: t("admin.dmDeleteDomainDesc"),
                            tone: "danger",
                            confirmLabel: t("admin.dmDeleteDomain"),
                          }))
                        )
                          return;
                        setNotice(await deleteDomainAction(domain.id));
                      }}
                      className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                }
              />

              {domain.subdomains.length === 0 ? (
                <CardBody className="text-xs text-ink-dim">
                  {t("admin.dmNoSubdomains")}
                </CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>{t("admin.dmThHostname")}</th>
                        <th>{t("admin.dmThRecord")}</th>
                        <th>{t("admin.dmThServer")}</th>
                        <th>{t("admin.dmThStatus")}</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {domain.subdomains.map((subdomain) => (
                        <tr key={subdomain.id}>
                          <td className="font-mono text-xs text-ink">
                            {subdomain.label}.{domain.name}
                          </td>
                          <td className="text-xs text-ink-muted">{subdomain.recordType}</td>
                          <td className="text-xs text-ink-muted">{subdomain.serverName ?? t("admin.dmUnassigned")}</td>
                          <td>
                            <StatusBadge state={subdomain.status} />
                          </td>
                          <td>
                            <button
                              type="button"
                              title={t("admin.dmDeleteSubdomain")}
                              onClick={async () => {
                                if (
                                  !(await confirm({
                                    title: t("admin.dmDeleteSubdomainTitle", { name: `${subdomain.label}.${domain.name}` }),
                                    tone: "danger",
                                    confirmLabel: t("admin.dmDeleteSubdomain"),
                                  }))
                                )
                                  return;
                                setNotice(await deleteSubdomainAction(subdomain.id));
                              }}
                              className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={domainOpen}
        onClose={() => setDomainOpen(false)}
        title={t("admin.dmAddDomain")}
        description={t("admin.dmAddDomainDesc")}
        width="lg"
      >
        <form action={domainAction} className="space-y-4">
          <FormError message={domainState.error} />
          <FormSuccess message={domainState.success} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.dmDomain")} required hint={t("admin.dmDomainHint")}>
              <Input name="name" required placeholder="sadlystudios.bond" className="font-mono" />
            </Field>
            <Field label={t("admin.dmNode")} hint={t("admin.dmNodeHint")}>
              <Select name="nodeId" defaultValue="">
                <option value="">{t("admin.dmAnyNode")}</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t("admin.dmTargetIp")} hint={t("admin.dmTargetIpHint")}>
            <Input name="targetIp" placeholder="203.0.113.10" className="font-mono" />
          </Field>

          <Field label={t("admin.dmDnsProvider")} hint={t("admin.dmDnsProviderHint")}>
            <Select name="dnsProvider" value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="manual">{t("admin.dmManual")}</option>
              <option value="cloudflare">Cloudflare</option>
            </Select>
          </Field>

          {provider === "cloudflare" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.dmZoneId")} required>
                <Input name="dnsZoneId" placeholder="023e105f4ecef8ad9ca31a8372d0c353" className="font-mono text-xs" />
              </Field>
              <Field label={t("admin.dmApiToken")} required hint={t("admin.dmApiTokenHint")}>
                <Input name="dnsApiToken" type="password" autoComplete="off" />
              </Field>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-line pt-4">
            <Checkbox
              name="isPublic"
              defaultChecked
              label={t("admin.dmUsersClaim")}
              description={t("admin.dmUsersClaimDesc")}
            />
            <Checkbox
              name="wildcardDns"
              label={t("admin.dmWildcardConfigured")}
              description={t("admin.dmWildcardConfiguredDesc")}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setDomainOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("admin.dmAdding")}>{t("admin.dmAddDomain")}</SubmitButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={subdomainDomainId !== null}
        onClose={() => setSubdomainDomainId(null)}
        title={t("admin.dmAddSubdomain")}
        description={t("admin.dmAddSubdomainDesc")}
      >
        <form action={subdomainAction} className="space-y-4">
          <input type="hidden" name="domainId" value={subdomainDomainId ?? ""} />
          <FormError message={subdomainState.error} />

          <Field label={t("admin.dmLabel")} required hint={t("admin.dmLabelHint")}>
            <Input name="label" required placeholder="play" className="font-mono" />
          </Field>

          <Field label={t("admin.dmServer")} hint={t("admin.dmServerHint")}>
            <Select name="serverId" defaultValue="">
              <option value="">{t("admin.dmUnassigned")}</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.uuidShort})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("admin.dmRecordType")} required>
              <Select name="recordType" defaultValue="A">
                <option value="A">A</option>
                <option value="CNAME">CNAME</option>
                <option value="SRV">SRV</option>
              </Select>
            </Field>
            <Field label={t("admin.dmTargetField")} hint={t("admin.dmTargetFieldHint")}>
              <Input name="target" placeholder="203.0.113.10" className="font-mono" />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setSubdomainDomainId(null)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("common.creating")}>{t("admin.dmCreateSubdomain")}</SubmitButton>
          </div>
        </form>
      </Modal>
      {dialog}
    </>
  );
}
