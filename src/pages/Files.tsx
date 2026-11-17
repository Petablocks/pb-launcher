import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, Download, File as FileIcon, Folder, FolderOpen, Lock, RefreshCw, Search, X } from "lucide-react";
import { inTauri } from "../auth";
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useLauncher } from "../state/LauncherProvider";

interface RemoteFileEntry {
  key: string;
  name: string;
  size: number;
  lastModified?: string | null;
  downloadUrl: string;
}

interface RemoteFilesListing {
  prefix: string;
  folders: string[];
  files: RemoteFileEntry[];
}

export default function Files() {
  const { session, setAccountOpen } = useLauncher();
  const [prefix, setPrefix] = useState("");
  const [listing, setListing] = useState<RemoteFilesListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);

  async function load(nextPrefix = prefix) {
    if (!inTauri || !session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<RemoteFilesListing>("files_list", { prefix: nextPrefix });
      setListing(res);
      setPrefix(res.prefix);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.uuid]);

  async function handleDownload(file: RemoteFileEntry) {
    setDownloadingKey(file.key);
    setDownloadedPath(null);
    setError(null);
    try {
      const saved = await invoke<string>("files_download", {
        url: file.downloadUrl,
        filename: file.name,
      });
      setDownloadedPath(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloadingKey(null);
    }
  }

  const breadcrumbs = prefix.split("/").filter(Boolean);
  const q = search.trim().toLowerCase();
  const folders = (listing?.folders ?? []).filter((f) => !q || f.toLowerCase().includes(q));
  const files = (listing?.files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="PETABLOCKS Files"
        description="Browse and download shared schematics, world backups, and packs from file.petablocks.com."
        actions={
          <Button
            variant="ghost"
            icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
            disabled={loading || !session}
            onClick={() => load(prefix)}
          >
            Refresh
          </Button>
        }
      />

      {!session ? (
        <EmptyState icon={<Lock size={34} />} title="Sign in required">
          Sign in with your Microsoft account and link Discord (<strong>Founder</strong>,{" "}
          <strong>Administrator</strong>, or <strong>Legacy Players</strong>) to access PETABLOCKS Files.
          <div className="mt-4">
            <Button onClick={() => setAccountOpen(true)}>Open Account</Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Folder breadcrumbs" className="flex flex-wrap items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => load("")}
                className="cursor-pointer rounded-md px-2 py-1 font-semibold text-pb-cyan hover:bg-white/5"
              >
                Root
              </button>
              {breadcrumbs.map((part, idx) => {
                const target = `${breadcrumbs.slice(0, idx + 1).join("/")}/`;
                return (
                  <span key={target} className="inline-flex items-center gap-1">
                    <ChevronRight size={13} className="text-pb-muted" />
                    <button
                      type="button"
                      onClick={() => load(target)}
                      className="cursor-pointer rounded-md px-2 py-1 font-semibold text-white hover:bg-white/5"
                    >
                      {part}
                    </button>
                  </span>
                );
              })}
            </nav>

            <div className="relative max-w-xs flex-1">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-pb-muted" />
              <input
                type="text"
                aria-label="Filter files"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter files or folders"
                className="pb-input pl-9 pr-8"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-pb-muted hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {error && (
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          {downloadedPath && (
            <Alert tone="success" onDismiss={() => setDownloadedPath(null)}>
              Saved to <span className="font-mono">{downloadedPath}</span>
            </Alert>
          )}

          {loading && !listing ? (
            <LoadingState>Loading files from file.petablocks.com…</LoadingState>
          ) : folders.length === 0 && files.length === 0 ? (
            <EmptyState icon={<FolderOpen size={34} />} title="No files here">
              {q ? "No files or folders match your filter." : "This folder is empty."}
            </EmptyState>
          ) : (
            <Card className="divide-y divide-white/5 p-0">
              {folders.map((folder) => {
                const label = folder.slice(prefix.length).replace(/\/$/, "");
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => load(folder)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Folder size={16} className="shrink-0 text-pb-cyan" />
                      <span className="truncate text-sm font-semibold text-white">{label}</span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-pb-muted" />
                  </button>
                );
              })}

              {files.map((file) => (
                <div
                  key={file.key}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileIcon size={16} className="shrink-0 text-pb-muted" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{file.name}</div>
                      <div className="text-2xs text-pb-muted">
                        {formatBytes(file.size)}
                        {file.lastModified ? ` · ${new Date(file.lastModified).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Download size={13} />}
                    loading={downloadingKey === file.key}
                    onClick={() => handleDownload(file)}
                  >
                    Download
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
