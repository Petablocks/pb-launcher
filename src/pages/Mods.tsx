import { useEffect, useState } from "react";
import { Boxes, FolderOpen, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { inTauri } from "../auth";
import { ModrinthLogo } from "../components/BrandIcons";
import InstanceSelector from "../components/InstanceSelector";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SegmentedControl,
  Switch,
} from "../components/ui";
import { formatBytes } from "../lib/format";
import { useLauncher, useManagedInstance } from "../state/LauncherProvider";
import { CustomModFile, getCustomModsDir, listCustomMods, setModEnabled } from "../sync";

type Filter = "optional" | "all" | "custom";

export default function Mods() {
  const instance = useManagedInstance();
  const { runtimeOf, setInstanceState, refreshInstance } = useLauncher();
  const rt = runtimeOf(instance.id);
  const manifest = rt.manifest;

  const [customMods, setCustomMods] = useState<CustomModFile[]>([]);
  const [filter, setFilter] = useState<Filter>("optional");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [custom] = await Promise.all([listCustomMods(instance.id), refreshInstance(instance)]);
      setCustomMods(custom);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // Reload only when the managed instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  async function toggleMod(slug: string, enable: boolean) {
    try {
      setInstanceState(instance.id, await setModEnabled(instance.id, slug, enable));
    } catch (e) {
      setError(String(e));
    }
  }

  const mods = manifest?.mods ?? [];
  const optionalCount = mods.filter((m) => m.optional).length;
  const query = search.trim().toLowerCase();
  const filteredMods = mods.filter((m) => {
    if (filter === "optional" && !m.optional) return false;
    if (!query) return true;
    return (
      m.slug.toLowerCase().includes(query) ||
      m.category.toLowerCase().includes(query) ||
      m.notes.toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Mods"
        description={
          <>
            Mods for <strong className="text-white">{instance.name}</strong>. Turn optional client
            mods on or off, or add your own.
          </>
        }
        actions={
          <>
            <Button
              icon={<FolderOpen size={15} />}
              disabled={!inTauri}
              onClick={() => getCustomModsDir(instance.id).catch((e) => setError(String(e)))}
            >
              Open custom mods folder
            </Button>
            <Button
              variant="ghost"
              icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
              disabled={loading}
              onClick={loadAll}
            >
              Refresh
            </Button>
          </>
        }
      >
        <InstanceSelector />
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Filter>
          label="Mod list"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "optional", label: `Optional (${optionalCount})` },
            { value: "all", label: `All pack mods (${mods.length})` },
            { value: "custom", label: `Your mods (${customMods.length})` },
          ]}
        />
        {filter !== "custom" && (
          <div className="relative max-w-xs flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-pb-muted" />
            <input
              type="search"
              aria-label="Search mods"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mods or categories"
              className="pb-input pl-9"
            />
          </div>
        )}
      </div>

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !manifest ? (
        <LoadingState>Loading the modpack…</LoadingState>
      ) : filter === "custom" ? (
        <Card>
          <h2 className="text-base">Your mods</h2>
          <p className="mt-1 text-xs text-pb-muted">
            Any <code className="font-mono">.jar</code> you put in the custom mods folder is kept across
            modpack updates and loaded with the pack.
          </p>
          {customMods.length === 0 ? (
            <div className="mt-5">
              <EmptyState icon={<Boxes size={28} />} title="No custom mods yet">
                Use <strong>Open custom mods folder</strong> above and drop client-side mods in.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-white/5">
              {customMods.map((c) => (
                <li key={c.filename} className="flex items-center justify-between py-3">
                  <span className="select-text font-mono text-xs text-white">{c.filename}</span>
                  <span className="text-xs text-pb-muted">{formatBytes(c.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : filteredMods.length === 0 ? (
        <EmptyState title={query ? "No mods match your search" : "No mods to show"}>
          {query
            ? "Try a different name or category."
            : manifest
              ? "This pack has no optional mods."
              : "The modpack list could not be loaded. Check your connection and refresh."}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {filteredMods.map((m) => {
            const enabled = !rt.state.disabledMods.includes(m.slug);
            return (
              <li
                key={m.slug}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-pb-card px-4 py-3.5 transition hover:border-white/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ModrinthLogo size={14} className="shrink-0 text-[#00AF5C]" />
                    <span className="text-sm font-bold text-white">{m.slug}</span>
                    {m.category && (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-pb-muted">
                        {m.category}
                      </span>
                    )}
                    <span className="text-2xs text-pb-muted">{formatBytes(m.size)}</span>
                  </div>
                  {m.notes && <p className="mt-1 truncate text-xs text-pb-muted">{m.notes}</p>}
                </div>
                {m.optional ? (
                  <Switch
                    checked={enabled}
                    onChange={(next) => toggleMod(m.slug, next)}
                    label={`${enabled ? "Disable" : "Enable"} ${m.slug}`}
                  />
                ) : (
                  <Badge tone="mint" className="rounded-md">
                    <ShieldCheck size={13} /> Required
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
