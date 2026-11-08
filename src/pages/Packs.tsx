import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FolderOpen,
  Palette,
  RefreshCw,
  Sparkles,
  Sun,
} from "lucide-react";
import { INSTANCES } from "../instances";
import {
  PackEntry,
  formatBytes,
  listPacks,
  openPacksDir,
  setActiveShader,
  setPackEnabled,
} from "../sync";
import { inTauri } from "../auth";

export default function Packs() {
  const instance = INSTANCES[0];
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await listPacks(instance.id);
      setPacks(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  async function handleTogglePack(p: PackEntry) {
    try {
      const next = await setPackEnabled(instance.id, p.kind, p.filename, !p.enabled);
      setPacks(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSelectShader(filename: string | null) {
    try {
      const next = await setActiveShader(instance.id, filename);
      setPacks(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleOpenFolder(kind: "shader" | "resourcepack") {
    setError(null);
    try {
      await openPacksDir(instance.id, kind);
    } catch (e) {
      setError(String(e));
    }
  }

  const shaders = packs.filter((p) => p.kind === "shader");
  const resourcePacks = packs.filter((p) => p.kind === "resourcepack");
  const activeShader = shaders.find((s) => s.active) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Shaders & Resource Packs</h1>
          <p className="mt-1 text-xs text-pb-muted">
            Switch active Iris shaderpacks (like Complementary Shaders) and manage resource packs for {instance.name}.
          </p>
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-pb-card px-3.5 py-2 text-xs font-bold text-pb-muted hover:text-white"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-pb-cyan" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Shaderpacks Section */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pb-purple/15 text-pb-purple">
              <Sun size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Iris Shaderpacks ({shaders.length})</h2>
              <p className="text-xs text-pb-muted">
                Select which shaderpack is active in `config/iris.properties`, or disable shaders for maximum FPS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeShader && (
              <button
                onClick={() => handleSelectShader(null)}
                className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-pb-muted hover:text-white"
              >
                Turn Shaders Off
              </button>
            )}
            <button
              onClick={() => handleOpenFolder("shader")}
              disabled={!inTauri}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-pb-bg px-3 py-1.5 text-xs font-semibold text-white hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
            >
              <FolderOpen size={14} /> Open `shaderpacks`
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {shaders.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-pb-bg p-4 text-xs text-pb-muted">
              No shaderpacks found yet. Click <strong>Sync Modpack</strong> on the Play tab to install Complementary Reimagined & Unbound, or drop `.zip` shaderpacks into the `shaderpacks` folder.
            </div>
          ) : (
            shaders.map((s) => (
              <div
                key={s.filename}
                className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 transition ${
                  s.active
                    ? "border-pb-cyan/50 bg-pb-cyan/10"
                    : "border-white/5 bg-pb-bg hover:border-white/15"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-white">{s.cleanName}</span>
                    {s.active && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pb-cyan/20 px-2 py-0.5 text-[10px] font-extrabold text-pb-cyan">
                        <Sparkles size={10} /> ACTIVE IN IRIS
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-pb-muted">
                    {s.filename} • {formatBytes(s.size)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectShader(s.active ? null : s.filename)}
                    disabled={!s.enabled}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                      s.active
                        ? "bg-pb-cyan text-[#031617]"
                        : "border border-white/10 bg-white/5 text-white hover:border-pb-cyan/40 hover:text-pb-cyan disabled:opacity-40"
                    }`}
                  >
                    {s.active ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={13} /> Active
                      </span>
                    ) : (
                      "Activate Shader"
                    )}
                  </button>
                  <button
                    onClick={() => handleTogglePack(s)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
                      s.enabled ? "bg-pb-mint" : "bg-white/15"
                    }`}
                    title={s.enabled ? "Enabled on disk" : "Disabled (.disabled)"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-[#031617] transition ${
                        s.enabled ? "translate-x-6" : "translate-x-1 bg-white"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Resource Packs Section */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pb-cyan/15 text-pb-cyan">
              <Palette size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Resource Packs ({resourcePacks.length})</h2>
              <p className="text-xs text-pb-muted">
                Toggle bundled or custom resource packs in your instance's `resourcepacks/` folder.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenFolder("resourcepack")}
            disabled={!inTauri}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-pb-bg px-3 py-1.5 text-xs font-semibold text-white hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
          >
            <FolderOpen size={14} /> Open `resourcepacks`
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {resourcePacks.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-pb-bg p-4 text-xs text-pb-muted">
              No custom `.zip` resource packs in `resourcepacks/` yet. Click <strong>Open `resourcepacks`</strong> above to drop in your favorite texture packs!
            </div>
          ) : (
            resourcePacks.map((rp) => (
              <div
                key={rp.filename}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-pb-bg p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{rp.cleanName}</div>
                  <div className="mt-0.5 text-[11px] text-pb-muted">
                    {rp.filename} • {formatBytes(rp.size)}
                  </div>
                </div>

                <button
                  onClick={() => handleTogglePack(rp)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
                    rp.enabled ? "bg-pb-cyan" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-[#031617] transition ${
                      rp.enabled ? "translate-x-6" : "translate-x-1 bg-white"
                    }`}
                  />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
