import { useEffect, useState } from "react";
import { FolderOpen, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { INSTANCES } from "../instances";
import { ScreenshotItem, getScreenshotsDir, listScreenshots } from "../community";
import { formatBytes } from "../sync";
import { inTauri } from "../auth";

export default function Screenshots() {
  const instance = INSTANCES[0];
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [selected, setSelected] = useState<ScreenshotItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await listScreenshots(instance.id);
      setItems(list);
      if (list.length > 0 && !selected) {
        setSelected(list[0]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openFolder() {
    try {
      const dir = await getScreenshotsDir(instance.id);
      await openPath(dir);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Screenshots Gallery</h1>
          <p className="mt-1 text-sm text-pb-muted">
            View and share your in-game captures from {instance.name}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openFolder}
            disabled={!inTauri}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-pb-card px-3.5 py-2 text-xs font-semibold text-white hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
          >
            <FolderOpen size={15} /> Open Screenshots Folder
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-pb-card px-3 py-2 text-xs font-semibold text-pb-muted hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-pb-card p-12 text-sm text-pb-muted">
          <Loader2 size={20} className="animate-spin text-pb-cyan" /> Loading screenshots...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-white/10 bg-pb-card p-12 text-center text-sm text-pb-muted">
          <ImageIcon size={36} className="mx-auto mb-3 text-pb-muted/50" />
          <div className="font-bold text-white">No screenshots yet</div>
          <p className="mt-1 text-xs">
            Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">F2</kbd> in-game to capture a screenshot and it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {selected && (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-pb-card">
              <img
                src={selected.dataUrl}
                alt={selected.filename}
                className="max-h-96 w-full bg-pb-bg object-contain"
              />
              <div className="flex items-center justify-between px-5 py-3 text-xs">
                <div>
                  <span className="font-mono font-bold text-white">{selected.filename}</span>
                  <span className="ml-3 text-pb-muted">{formatBytes(selected.size)}</span>
                </div>
                <button
                  onClick={() => openPath(selected.path).catch(() => {})}
                  className="text-pb-cyan hover:underline"
                >
                  Open File
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
            {items.map((item) => {
              const isSel = selected?.filename === item.filename;
              return (
                <button
                  key={item.filename}
                  onClick={() => setSelected(item)}
                  className={`group overflow-hidden rounded-xl border text-left transition ${
                    isSel
                      ? "border-pb-cyan ring-2 ring-pb-cyan/30"
                      : "border-white/10 hover:border-white/25"
                  }`}
                >
                  <img
                    src={item.dataUrl}
                    alt={item.filename}
                    className="h-24 w-full object-cover transition group-hover:scale-105"
                  />
                  <div className="truncate bg-pb-card px-2.5 py-1.5 font-mono text-[11px] text-pb-muted">
                    {item.filename}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
