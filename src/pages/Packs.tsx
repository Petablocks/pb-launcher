import { useEffect, useState } from "react";
import { CheckCircle2, FolderOpen, Palette, RefreshCw, Sparkles, Sun } from "lucide-react";
import { inTauri } from "../auth";
import InstanceSelector from "../components/InstanceSelector";
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Switch, cn } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useManagedInstance } from "../state/LauncherProvider";
import { PackEntry, listPacks, openPacksDir, setActiveShader, setPackEnabled } from "../sync";

export default function Packs() {
  const instance = useManagedInstance();
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<PackEntry[]>) {
    setError(null);
    try {
      setPacks(await task());
    } catch (e) {
      setError(String(e));
    }
  }

  async function refresh() {
    setLoading(true);
    await run(() => listPacks(instance.id));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // Reload only when the managed instance changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  const togglePack = (p: PackEntry, enabled: boolean) =>
    run(() => setPackEnabled(instance.id, p.kind, p.filename, enabled));
  const selectShader = (filename: string | null) => run(() => setActiveShader(instance.id, filename));
  const openFolder = (kind: PackEntry["kind"]) =>
    openPacksDir(instance.id, kind).catch((e) => setError(String(e)));

  const shaders = packs.filter((p) => p.kind === "shader");
  const resourcePacks = packs.filter((p) => p.kind === "resourcepack");
  const activeShader = shaders.find((s) => s.active) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Shaders & Packs"
        description={
          <>
            Choose the active shader and manage resource packs for{" "}
            <strong className="text-white">{instance.name}</strong>.
          </>
        }
        actions={
          <Button
            variant="ghost"
            icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
            disabled={loading}
            onClick={refresh}
          >
            Refresh
          </Button>
        }
      >
        <InstanceSelector />
      </PageHeader>

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader
          tone="purple"
          icon={<Sun size={20} />}
          title={`Shaders (${shaders.length})`}
          description="Pick the shader Iris loads, or turn shaders off for the best frame rate."
          actions={
            <>
              {activeShader && (
                <Button size="sm" variant="ghost" onClick={() => selectShader(null)}>
                  Turn shaders off
                </Button>
              )}
              <Button
                size="sm"
                icon={<FolderOpen size={14} />}
                disabled={!inTauri}
                onClick={() => openFolder("shader")}
              >
                Open folder
              </Button>
            </>
          }
        />
        <div className="mt-4 space-y-2.5">
          {shaders.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-pb-bg p-4 text-xs text-pb-muted">
              No shaders installed yet. The bundled shaders arrive the first time you install the
              modpack from the Play tab, or you can drop <code className="font-mono">.zip</code>{" "}
              shaderpacks into the folder.
            </p>
          ) : (
            shaders.map((s) => (
              <div
                key={s.filename}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-xl border p-3.5 transition",
                  s.active ? "border-pb-cyan/50 bg-pb-cyan/10" : "border-white/5 bg-pb-bg hover:border-white/15",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-white">{s.cleanName}</span>
                    {s.active && (
                      <Badge tone="cyan">
                        <Sparkles size={10} /> Active
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-2xs text-pb-muted">
                    {s.filename} · {formatBytes(s.size)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant={s.active ? "primary" : "secondary"}
                    disabled={!s.enabled}
                    icon={s.active ? <CheckCircle2 size={13} /> : undefined}
                    onClick={() => selectShader(s.active ? null : s.filename)}
                  >
                    {s.active ? "In use" : "Use this shader"}
                  </Button>
                  <Switch
                    tone="mint"
                    checked={s.enabled}
                    onChange={(next) => togglePack(s, next)}
                    label={`${s.enabled ? "Hide" : "Show"} ${s.cleanName} in the game's shader list`}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Palette size={20} />}
          title={`Resource packs (${resourcePacks.length})`}
          description="Turn bundled or your own resource packs on or off."
          actions={
            <Button
              size="sm"
              icon={<FolderOpen size={14} />}
              disabled={!inTauri}
              onClick={() => openFolder("resourcepack")}
            >
              Open folder
            </Button>
          }
        />
        <div className="mt-4 space-y-2.5">
          {resourcePacks.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-pb-bg p-4 text-xs text-pb-muted">
              No resource packs yet. Use <strong>Open folder</strong> and drop your{" "}
              <code className="font-mono">.zip</code> packs in.
            </p>
          ) : (
            resourcePacks.map((rp) => (
              <div
                key={rp.filename}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-pb-bg p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{rp.cleanName}</div>
                  <div className="mt-0.5 truncate text-2xs text-pb-muted">
                    {rp.filename} · {formatBytes(rp.size)}
                  </div>
                </div>
                <Switch
                  checked={rp.enabled}
                  onChange={(next) => togglePack(rp, next)}
                  label={`${rp.enabled ? "Disable" : "Enable"} ${rp.cleanName}`}
                />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
