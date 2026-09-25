"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  File as FileIcon,
  FilePlus2,
  FolderPlus,
  Folder,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Archive,
  ArchiveRestore,
  X,
} from "lucide-react";
import {
  compressFilesAction,
  createDirectoryAction,
  decompressFileAction,
  deleteFilesAction,
  listFilesAction,
  pullFileAction,
  readFileAction,
  renameFileAction,
  writeFileAction,
} from "../../actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n/preferences";

interface Entry {
  name: string;
  mode: string;
  size: number;
  isFile: boolean;
  isSymlink: boolean;
  mimetype: string;
  modifiedAt: string;
}

const EDITABLE = /\.(txt|log|json|ya?ml|toml|properties|conf|cfg|ini|env|md|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|php|sh|bash|xml|sql|lua|py|rb|java|gradle|dockerfile|gitignore)$/i;
const ARCHIVE = /\.(zip|tar|tar\.gz|tgz|tar\.xz|rar|7z|gz)$/i;

function joinPath(root: string, name: string): string {
  const base = root.endsWith("/") ? root : `${root}/`;
  return `${base}${name}`.replace(/\/{2,}/g, "/");
}

export function FileManager({
  serverUuid,
  canWrite,
  canDelete,
  canArchive,
}: {
  serverUuid: string;
  canWrite: boolean;
  canDelete: boolean;
  canArchive: boolean;
}) {
  const t = useT();
  const [directory, setDirectory] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const [editing, setEditing] = useState<{ path: string; name: string; contents: string } | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [renaming, setRenaming] = useState<Entry | null>(null);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      try {
        const result = await listFilesAction(serverUuid, target);
        setEntries(result.entries ?? []);
      } catch (err) {
        setEntries([]);
        setError(err instanceof Error ? err.message : t("dashboard.serverFilesListError"));
      } finally {
        setLoading(false);
      }
    },
    [serverUuid],
  );

  useEffect(() => {
    void load(directory);
  }, [directory, load]);

  const crumbs = useMemo(() => {
    const parts = directory.split("/").filter(Boolean);
    return [{ label: t("dashboard.serverFilesRootCrumb"), path: "/" }].concat(
      parts.map((part, index) => ({ label: part, path: `/${parts.slice(0, index + 1).join("/")}` })),
    );
  }, [directory]);

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [entries],
  );

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await fn();
    if (result.ok) {
      setNotice(result.message ?? t("dashboard.serverFilesDone"));
      await load(directory);
    } else {
      setError(result.error ?? t("dashboard.serverFilesActionFailed"));
    }
    setBusy(false);
  };

  const openEntry = async (entry: Entry) => {
    if (!entry.isFile) {
      setDirectory(joinPath(directory, entry.name));
      return;
    }
    if (!EDITABLE.test(entry.name) && !entry.mimetype.startsWith("text/")) {
      setError(t("dashboard.serverFilesNotEditable"));
      return;
    }
    const path = joinPath(directory, entry.name);
    setBusy(true);
    const result = await readFileAction(serverUuid, path);
    setBusy(false);
    if (result.ok) setEditing({ path, name: entry.name, contents: result.contents ?? "" });
    else setError(result.error ?? t("dashboard.serverFilesReadError"));
  };

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectedPaths = [...selected];

  return (
    <>
      <Card>
        <CardHeader
          title={t("dashboard.serverFilesTitle")}
          description={<span className="font-mono text-xs">{directory}</span>}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => load(directory)} loading={loading}>
                <RefreshCw className="size-3.5" />
                {t("common.refresh")}
              </Button>
              {canWrite ? (
                <>
                  <Button variant="ghost" onClick={() => setNewFolder(true)}>
                    <FolderPlus className="size-3.5" />
                    {t("dashboard.serverFilesFolder")}
                  </Button>
                  <Button variant="ghost" onClick={() => setNewFile(true)}>
                    <FilePlus2 className="size-3.5" />
                    {t("dashboard.serverFilesFile")}
                  </Button>
                  <Button variant="ghost" onClick={() => setPullOpen(true)}>
                    <Download className="size-3.5" />
                    {t("dashboard.serverFilesPullUrl")}
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-1 border-b border-line px-5 py-2 text-xs">
          {directory !== "/" ? (
            <button
              type="button"
              onClick={() => setDirectory(directory.split("/").slice(0, -1).join("/") || "/")}
              className="me-1 rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink"
              aria-label={t("dashboard.serverFilesUpLevel")}
            >
              <ArrowLeft className="size-3.5" />
            </button>
          ) : null}
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {index > 0 ? <span className="text-ink-dim">/</span> : null}
              <button
                type="button"
                onClick={() => setDirectory(crumb.path)}
                className={cn(
                  "rounded px-1 py-0.5 font-mono hover:bg-surface-2",
                  index === crumbs.length - 1 ? "text-ink" : "text-ink-dim",
                )}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {selectedPaths.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/50 px-5 py-2">
            <span className="text-xs text-ink-muted">{t("dashboard.serverFilesSelectedCount", { count: String(selectedPaths.length) })}</span>
            {canArchive ? (
              <Button variant="ghost" disabled={busy} onClick={() => run(() => compressFilesAction(serverUuid, directory, selectedPaths))}>
                <Archive className="size-3.5" />
                {t("dashboard.serverFilesCompress")}
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: t("dashboard.serverFilesDeleteManyTitle", { count: String(selectedPaths.length) }),
                      description: t("dashboard.serverFilesCannotUndo"),
                      tone: "danger",
                      confirmLabel: t("common.delete"),
                    }))
                  )
                    return;
                  void run(() => deleteFilesAction(serverUuid, directory, selectedPaths));
                }}
              >
                <Trash2 className="size-3.5" />
                {t("common.delete")}
              </Button>
            ) : null}
            <button type="button" onClick={() => setSelected(new Set())} className="ms-auto text-xs text-ink-dim hover:text-ink">
              {t("dashboard.serverFilesClear")}
            </button>
          </div>
        ) : null}

        {error ? (
          <CardBody className="border-b border-line-soft">
            <Alert tone="bad">{error}</Alert>
          </CardBody>
        ) : null}
        {notice ? <div className="border-b border-ok/30 bg-ok/10 px-5 py-2 text-xs text-ok">{notice}</div> : null}

        {loading ? (
          <CardBody className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 spin" />
            {t("dashboard.serverFilesLoading")}
          </CardBody>
        ) : sorted.length === 0 ? (
          <EmptyState icon={<Folder className="size-5" />} title={t("dashboard.serverFilesEmptyTitle")} description={t("dashboard.serverFilesEmptyDescription")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-8" />
                  <th>{t("dashboard.serverFilesColName")}</th>
                  <th className="w-28">{t("dashboard.serverFilesColSize")}</th>
                  <th className="w-24">{t("dashboard.serverFilesColMode")}</th>
                  <th className="w-44">{t("dashboard.serverFilesColModified")}</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr key={entry.name}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.name)}
                        onChange={() => toggle(entry.name)}
                        aria-label={t("dashboard.serverFilesSelectItem", { name: entry.name })}
                        className="size-3.5 rounded border-line bg-canvas accent-brand"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openEntry(entry)}
                        className="flex items-center gap-2 text-start hover:text-brand-soft"
                      >
                        {entry.isFile ? (
                          <FileIcon className="size-4 shrink-0 text-ink-dim" />
                        ) : (
                          <Folder className="size-4 shrink-0 text-brand-soft" />
                        )}
                        <span className="truncate font-mono text-xs">{entry.name}</span>
                      </button>
                    </td>
                    <td className="font-mono text-xs text-ink-muted">{entry.isFile ? formatBytes(entry.size) : "—"}</td>
                    <td className="font-mono text-xs text-ink-dim">{entry.mode}</td>
                    <td className="text-xs text-ink-dim">{formatDate(entry.modifiedAt)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {canArchive && entry.isFile && ARCHIVE.test(entry.name) ? (
                          <button
                            type="button"
                            title={t("dashboard.serverFilesExtract")}
                            onClick={() => run(() => decompressFileAction(serverUuid, directory, entry.name))}
                            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                          >
                            <ArchiveRestore className="size-3.5" />
                          </button>
                        ) : null}
                        {canWrite ? (
                          <button
                            type="button"
                            title={t("dashboard.serverFilesRename")}
                            onClick={() => setRenaming(entry)}
                            className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            title={t("common.delete")}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: t("dashboard.serverFilesDeleteOneTitle", { name: entry.name }),
                                  description: t("dashboard.serverFilesCannotUndo"),
                                  tone: "danger",
                                  confirmLabel: t("common.delete"),
                                }))
                              )
                                return;
                              void run(() => deleteFilesAction(serverUuid, directory, [entry.name]));
                            }}
                            className="rounded p-1 text-ink-dim hover:bg-bad/15 hover:text-bad"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <FileIcon className="size-4 text-ink-dim" />
            <span className="truncate font-mono text-xs text-ink">{editing.path}</span>
            <div className="ml-auto flex items-center gap-2">
              {canWrite ? (
                <Button
                  loading={editorSaving}
                  onClick={async () => {
                    setEditorSaving(true);
                    const result = await writeFileAction(serverUuid, editing.path, editing.contents);
                    setEditorSaving(false);
                    if (result.ok) {
                      setNotice(t("dashboard.serverFilesSaved"));
                      setEditing(null);
                      await load(directory);
                    } else {
                      setError(result.error ?? t("dashboard.serverFilesSaveError"));
                    }
                  }}
                >
                  <Save className="size-3.5" />
                  {t("common.save")}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <X className="size-3.5" />
                {t("common.close")}
              </Button>
            </div>
          </header>
          <textarea
            value={editing.contents}
            onChange={(event) => setEditing({ ...editing, contents: event.target.value })}
            spellCheck={false}
            readOnly={!canWrite}
            className="flex-1 resize-none bg-[#060607] p-4 font-mono text-xs leading-relaxed text-ink outline-none"
          />
        </div>
      ) : null}

      <Modal
        open={newFolder}
        onClose={() => setNewFolder(false)}
        title={t("dashboard.serverFilesCreateFolder")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewFolder(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              form="new-folder-form"
              type="submit"
            >
              {t("common.create")}
            </Button>
          </>
        }
      >
        <form
          id="new-folder-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            setNewFolder(false);
            await run(() => createDirectoryAction(serverUuid, directory, name));
          }}
        >
          <Field label={t("dashboard.serverFilesFolderName")} required>
            <Input name="name" required placeholder="plugins" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={newFile}
        onClose={() => setNewFile(false)}
        title={t("dashboard.serverFilesCreateFile")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewFile(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="new-file-form" type="submit">
              {t("common.create")}
            </Button>
          </>
        }
      >
        <form
          id="new-file-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
            if (!name) return;
            setNewFile(false);
            await run(() => writeFileAction(serverUuid, joinPath(directory, name), ""));
          }}
        >
          <Field label={t("dashboard.serverFilesFileName")} required hint={t("dashboard.serverFilesFileNameHint")}>
            <Input name="name" required placeholder="config.yml" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        title={t("dashboard.serverFilesPullTitle")}
        description={t("dashboard.serverFilesPullDescription")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPullOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button form="pull-form" type="submit">
              {t("dashboard.serverFilesDownload")}
            </Button>
          </>
        }
      >
        <form
          id="pull-form"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const url = String(data.get("url") ?? "").trim();
            const fileName = String(data.get("fileName") ?? "").trim();
            if (!url) return;
            setPullOpen(false);
            await run(() => pullFileAction(serverUuid, directory, url, fileName || undefined));
          }}
        >
          <Field label={t("dashboard.serverFilesUrlLabel")} required>
            <Input name="url" required type="url" placeholder="https://example.com/plugin.jar" />
          </Field>
          <Field label={t("dashboard.serverFilesSaveAs")} hint={t("dashboard.serverFilesSaveAsHint")}>
            <Input name="fileName" placeholder="plugin.jar" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t("dashboard.serverFilesRenameTitle", { name: renaming?.name ?? "" })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              {t("common.cancel")}
            </Button>
            <Button form="rename-form" type="submit">
              {t("dashboard.serverFilesRename")}
            </Button>
          </>
        }
      >
        <form
          id="rename-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const to = String(new FormData(event.currentTarget).get("to") ?? "").trim();
            const from = renaming?.name;
            setRenaming(null);
            if (!to || !from) return;
            await run(() => renameFileAction(serverUuid, directory, from, to));
          }}
        >
          <Field label={t("dashboard.serverFilesNewName")} required>
            <Input name="to" required defaultValue={renaming?.name} />
          </Field>
        </form>
      </Modal>
      {dialog}
    </>
  );
}
