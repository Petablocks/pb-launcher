import { useEffect, useState } from "react";
import { Boxes, CheckCircle2, FolderOpen, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { INSTANCES } from "../instances";
import {
  CustomModFile,
  InstanceState,
  LauncherManifest,
  formatBytes,
  getCustomModsDir,
  getManifest,
  getSyncState,
  listCustomMods,
  setModEnabled,
} from "../sync";
import { inTauri } from "../auth";
import { ModrinthLogo } from "../components/BrandIcons";
import InstanceSelector from "../components/InstanceSelector";

interface ModsProps {
  selectedInstanceId?: string;
  onSelectInstance?: (id: string) => void;
}

export default function Mods({
  selectedInstanceId = "petablocks-s2",
  onSelectInstance,
}: ModsProps) {
  const instance =
    INSTANCES.find((i) => i.id === selectedInstanceId) ?? INSTANCES[0];
  const [manifest, setManifest] = useState<LauncherManifest | null>(null);
  const [state, setState] = useState<InstanceState>({ installedVersion: null, disabledMods: [] });
  const [customMods, setCustomMods] = useState<CustomModFile[]>([]);
  const [filter, setFilter] = useState<"optional" | "all" | "custom">("optional");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([getSyncState(instance.id), listCustomMods(instance.id)]);
      setState(s);
      setCustomMods(c);
      if (inTauri) {
        const m = await getManifest(instance.id, instance.manifestUrl);
        setManifest(m);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id, instance.manifestUrl]);

  async function toggleMod(slug: string, currentlyEnabled: boolean) {
    try {
      const next = await setModEnabled(instance.id, slug, !currentlyEnabled);
      setState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function openCustomFolder() {
    setError(null);
    try {
      await getCustomModsDir(instance.id);
    } catch (e) {
      setError(String(e));
    }
  }

  const optionalCount = manifest?.mods.filter((m) => m.optional).length ?? 0;
  const totalCount = manifest?.mods.length ?? 0;

  const filteredMods =
    manifest?.mods.filter((m) => {
      if (filter === "optional" && !m.optional) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          m.slug.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          m.notes.toLowerCase().includes(q)
        );
      }
      return true;
    }) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold">Mod Manager</h1>
            {onSelectInstance && (
              <InstanceSelector
                selectedInstanceId={instance.id}
                onSelectInstance={onSelectInstance}
              />
            )}
          </div>
          <p className="mt-1 text-sm text-pb-muted">
            Managing mods for <strong className="text-white">{instance.name}</strong>. Customize optional client mods or drop custom jars.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCustomFolder}
            disabled={!inTauri}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-pb-card px-3.5 py-2 text-xs font-semibold text-white hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
          >
            <FolderOpen size={15} /> Open Custom Mods Folder
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-pb-card px-3 py-2 text-xs font-semibold text-pb-muted hover:text-white"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-pb-card p-1">
          <button
            onClick={() => setFilter("optional")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              filter === "optional" ? "bg-pb-cyan text-[#031617]" : "text-pb-muted hover:text-white"
            }`}
          >
            Optional Toggles ({optionalCount})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              filter === "all" ? "bg-pb-cyan text-[#031617]" : "text-pb-muted hover:text-white"
            }`}
          >
            All Pack Mods ({totalCount})
          </button>
          <button
            onClick={() => setFilter("custom")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              filter === "custom" ? "bg-pb-cyan text-[#031617]" : "text-pb-muted hover:text-white"
            }`}
          >
            Custom Folder ({customMods.length})
          </button>
        </div>

        {filter !== "custom" && (
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pb-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mods or categories..."
              className="w-full rounded-xl border border-white/10 bg-pb-card py-2 pl-9 pr-3 text-xs text-white placeholder-pb-muted focus:border-pb-cyan focus:outline-none"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-pb-card p-12 text-sm text-pb-muted">
          <Loader2 size={20} className="animate-spin text-pb-cyan" /> Loading modpack manifest...
        </div>
      ) : filter === "custom" ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-pb-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Player Custom Mods (`mods/custom/`)</h2>
              <p className="mt-1 text-xs text-pb-muted">
                Any `.jar` placed in this folder is preserved across modpack updates and copied into `mods/` before launch.
              </p>
            </div>
          </div>

          {customMods.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-pb-muted">
              <Boxes size={28} className="mx-auto mb-2 text-pb-muted/60" />
              No custom mods added yet. Click <strong>Open Custom Mods Folder</strong> above to drop in client-side `.jar` files.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-white/5">
              {customMods.map((c) => (
                <div key={c.filename} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-mono text-xs text-white">{c.filename}</span>
                  <span className="text-xs text-pb-muted">{formatBytes(c.size)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {filteredMods.map((m) => {
            const enabled = !state.disabledMods.includes(m.slug);
            return (
              <div
                key={m.slug}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-pb-card px-4 py-3.5 transition hover:border-white/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ModrinthLogo size={14} className="shrink-0 text-[#00AF5C]" />
                    <span className="font-bold text-sm text-white">{m.slug}</span>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pb-muted">
                      {m.category}
                    </span>
                    <span className="text-[11px] text-pb-muted">{formatBytes(m.size)}</span>
                  </div>
                  {m.notes && <p className="mt-1 truncate text-xs text-pb-muted">{m.notes}</p>}
                </div>

                {m.optional ? (
                  <button
                    onClick={() => toggleMod(m.slug, enabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
                      enabled ? "bg-pb-cyan" : "bg-white/15"
                    }`}
                    aria-label={`Toggle ${m.slug}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-[#031617] transition ${
                        enabled ? "translate-x-6" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-pb-mint/10 px-2.5 py-1 text-[11px] font-semibold text-pb-mint">
                    <ShieldCheck size={13} /> Required
                  </span>
                )}
              </div>
            );
          })}

          {filteredMods.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-pb-card p-8 text-center text-xs text-pb-muted">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-pb-muted" />
              No mods match your search filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
