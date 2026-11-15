import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FolderOpen, Image as ImageIcon, RefreshCw } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { inTauri } from "../auth";
import {
  ScreenshotItem,
  getScreenshotsDir,
  listScreenshots,
  openScreenshotFile,
} from "../community";
import InstanceSelector from "../components/InstanceSelector";
import { Alert, Button, EmptyState, LoadingState, PageHeader, cn } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useManagedInstance } from "../state/LauncherProvider";

export default function Screenshots() {
  const instance = useManagedInstance();
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await listScreenshots(instance.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setSelectedName(null);
    load();
    // Reload only when the managed instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  // Falls back to the newest capture, including after switching instance.
  const selectedIndex = items.findIndex((i) => i.filename === selectedName);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = items[activeIndex] ?? null;

  useEffect(() => {
    if (items.length <= 1) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = (activeIndex - 1 + items.length) % items.length;
        setSelectedName(items[prev].filename);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = (activeIndex + 1) % items.length;
        setSelectedName(items[next].filename);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, items]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Screenshots"
        description={
          <>
            Your in-game captures from <strong className="text-white">{instance.name}</strong>.
          </>
        }
        actions={
          <>
            <Button
              icon={<FolderOpen size={15} />}
              disabled={!inTauri}
              onClick={() => getScreenshotsDir(instance.id).catch((e) => setError(String(e)))}
            >
              Open folder
            </Button>
            <Button
              variant="ghost"
              icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
              disabled={loading}
              onClick={load}
            >
              Refresh
            </Button>
          </>
        }
      >
        <InstanceSelector />
      </PageHeader>

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && items.length === 0 ? (
        <LoadingState>Loading screenshots…</LoadingState>
      ) : !selected ? (
        <EmptyState icon={<ImageIcon size={36} />} title="No screenshots yet">
          Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">F2</kbd> in-game and your
          capture shows up here.
        </EmptyState>
      ) : (
        <>
          <figure className="overflow-hidden rounded-2xl border border-white/10 bg-pb-card">
            <img
              src={convertFileSrc(selected.path)}
              alt={selected.filename}
              className="max-h-96 w-full bg-pb-bg object-contain"
            />
            <figcaption className="flex items-center justify-between gap-3 px-5 py-3 text-xs">
              <span className="min-w-0 truncate">
                <span className="font-mono font-bold text-white">{selected.filename}</span>
                <span className="ml-3 text-pb-muted">{formatBytes(selected.size)}</span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {items.length > 1 && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Previous screenshot"
                      icon={<ChevronLeft size={14} />}
                      onClick={() =>
                        setSelectedName(items[(activeIndex - 1 + items.length) % items.length].filename)
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Next screenshot"
                      icon={<ChevronRight size={14} />}
                      onClick={() =>
                        setSelectedName(items[(activeIndex + 1) % items.length].filename)
                      }
                    />
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={copiedPath ? <Check size={12} className="text-pb-mint" /> : <Copy size={12} />}
                  onClick={() => {
                    navigator.clipboard
                      .writeText(selected.path)
                      .then(() => {
                        setCopiedPath(true);
                        setTimeout(() => setCopiedPath(false), 1500);
                      })
                      .catch(() => {});
                  }}
                >
                  {copiedPath ? "Copied" : "Copy path"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-pb-cyan"
                  icon={<ExternalLink size={12} />}
                  onClick={() =>
                    openScreenshotFile(instance.id, selected.filename).catch((e) => setError(String(e)))
                  }
                >
                  Open image
                </Button>
              </div>
            </figcaption>
          </figure>

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
            {items.map((item) => {
              const isSelected = selected.filename === item.filename;
              return (
                <button
                  key={item.filename}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedName(item.filename)}
                  className={cn(
                    "group overflow-hidden rounded-xl border text-left transition",
                    isSelected ? "border-pb-cyan ring-2 ring-pb-cyan/30" : "border-white/10 hover:border-white/25",
                  )}
                >
                  <img
                    src={convertFileSrc(item.path)}
                    loading="lazy"
                    alt={item.filename}
                    className="h-24 w-full object-cover transition group-hover:scale-105"
                  />
                  <div className="truncate bg-pb-card px-2.5 py-1.5 font-mono text-2xs text-pb-muted">
                    {item.filename}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
