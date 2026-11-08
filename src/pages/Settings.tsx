import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  DownloadCloud,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  Server,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { INSTANCES } from "../instances";
import {
  JavaStatus,
  LauncherSettings,
  detectJava,
  getInstanceDir,
  getSettings,
  installJava21,
  saveSettings,
} from "../launch";
import { inTauri } from "../auth";
import { DiscordLogo } from "../components/BrandIcons";

export default function Settings() {
  const instance = INSTANCES[0];
  const [settings, setSettings] = useState<LauncherSettings>({
    memoryMb: 6144,
    customJavaPath: null,
    extraJvmArgs: "",
    closeOnLaunch: false,
    directConnect: true,
  });
  const [java, setJava] = useState<JavaStatus>({
    found: false,
    path: null,
    version: null,
    source: "missing",
  });
  const [installingJava, setInstallingJava] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cap the slider at 75% of physical RAM (the backend enforces the same limit at launch).
  const [maxMemoryMb, setMaxMemoryMb] = useState(16384);

  useEffect(() => {
    if (inTauri) {
      invoke<number>("system_memory_mb")
        .then((total) => {
          if (total > 0) setMaxMemoryMb(Math.max(3072, Math.min(16384, Math.floor((total * 0.75) / 512) * 512)));
        })
        .catch(() => {});
    }
    getSettings().then(setSettings).catch(() => {});
    detectJava().then(setJava).catch(() => {});
  }, []);

  async function handleSave() {
    setError(null);
    try {
      await saveSettings(settings);
      const j = await detectJava();
      setJava(j);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleInstallJava() {
    setInstallingJava(true);
    setError(null);
    try {
      const j = await installJava21();
      setJava(j);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstallingJava(false);
    }
  }

  const TUNING_PRESETS = [
    {
      id: "eco" as const,
      name: "Eco / Low-End (6 GB)",
      desc: "Optimized for 8GB–12GB PCs. Lightweight G1GC tuning with minimal background footprint.",
      ramMb: 6144,
      jvmArgs:
        "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC",
    },
    {
      id: "standard" as const,
      name: "Standard (8 GB - Recommended)",
      desc: "Balanced high-performance tuning for Season 2 Create contraptions and heavy mod loads.",
      ramMb: 8192,
      jvmArgs:
        "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
    },
    {
      id: "enthusiast" as const,
      name: "Enthusiast (12 GB - Generational ZGC)",
      desc: "High-spec 16GB+ systems with Java 21 Generational ZGC for ultra-low latency & zero stutter.",
      ramMb: 12288,
      jvmArgs:
        "-XX:+UseZGC -XX:+ZGenerational -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
    },
  ];

  function applyPreset(presetId: "eco" | "standard" | "enthusiast") {
    const p = TUNING_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setSettings({
      ...settings,
      tuningPreset: presetId,
      memoryMb: p.ramMb,
      extraJvmArgs: p.jvmArgs,
    });
  }

  async function handleOpenInstanceFolder() {
    setError(null);
    try {
      await getInstanceDir(instance.id);
    } catch (e) {
      setError(String(e));
    }
  }

  const memoryGb = (settings.memoryMb / 1024).toFixed(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Launcher Settings</h1>
          <p className="mt-1 text-sm text-pb-muted">
            Configure Java 21 runtime, memory allocation, and launch behavior.
          </p>
        </div>
        <button
          onClick={handleOpenInstanceFolder}
          disabled={!inTauri}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-pb-card px-3.5 py-2 text-xs font-semibold text-white hover:border-pb-cyan/50 hover:text-pb-cyan disabled:opacity-50"
        >
          <FolderOpen size={15} /> Open Instance Folder
        </button>
      </div>

      {/* Java 21 Runtime Card */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pb-cyan/15 text-pb-cyan">
              <Cpu size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold">Java 21 OpenJDK Runtime</h2>
              <p className="text-xs text-pb-muted">
                Minecraft 1.21.1 & NeoForge require a 64-bit Java 21 runtime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => detectJava().then(setJava)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-pb-muted hover:text-white"
            >
              <RefreshCw size={13} /> Re-scan
            </button>
            {!java.found && (
              <button
                onClick={handleInstallJava}
                disabled={installingJava || !inTauri}
                className="inline-flex items-center gap-2 rounded-lg bg-pb-cyan px-3.5 py-1.5 text-xs font-extrabold text-[#031617] hover:brightness-110 disabled:opacity-50"
              >
                {installingJava ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Installing Java 21...
                  </>
                ) : (
                  <>
                    <DownloadCloud size={14} /> Auto-Install Java 21
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/5 bg-pb-bg p-4 text-xs">
          {java.found ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-pb-mint">
                <CheckCircle2 size={15} /> Java 21 Ready ({java.source})
              </div>
              <div className="font-mono text-pb-muted">{java.version}</div>
              <div className="truncate font-mono text-[11px] text-pb-muted/80">{java.path}</div>
            </div>
          ) : (
            <div className="text-pb-muted">
              No Java 21 runtime detected yet. Click <strong>Auto-Install Java 21</strong> above or press <strong>Play</strong> on the Home tab and the launcher will download Adoptium OpenJDK 21 automatically.
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-pb-muted">
            Custom `java.exe` Path (Optional override)
          </label>
          <input
            type="text"
            value={settings.customJavaPath ?? ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customJavaPath: e.target.value.trim() ? e.target.value : null,
              })
            }
            placeholder="Leave empty to use auto-detected or managed Adoptium Java 21"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3 py-2 font-mono text-xs text-white placeholder-pb-muted/60 focus:border-pb-cyan focus:outline-none"
          />
        </div>
      </section>

      {/* Performance Tuning Presets & Memory Allocation */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6 space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold">Game Memory & JVM Tuning Profiles</h2>
              <p className="mt-0.5 text-xs text-pb-muted">
                Pre-configured garbage collection profiles optimized for Adoptium OpenJDK 21 and heavy Create networks.
              </p>
            </div>
            <span className="rounded-lg bg-pb-cyan/15 px-2.5 py-1 text-xs font-extrabold text-pb-cyan">
              {settings.memoryMb} MB ({memoryGb} GB)
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TUNING_PRESETS.map((p) => {
              const active = settings.tuningPreset === p.id || (settings.memoryMb === p.ramMb && settings.extraJvmArgs === p.jvmArgs);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                    active
                      ? "border-pb-cyan bg-pb-cyan/10 shadow-sm shadow-pb-cyan/20 ring-1 ring-pb-cyan"
                      : "border-white/10 bg-pb-bg hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-extrabold ${active ? "text-pb-cyan" : "text-white"}`}>
                        {p.name}
                      </span>
                      {active && <CheckCircle2 size={13} className="text-pb-cyan shrink-0 ml-1" />}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-pb-muted">{p.desc}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] font-mono text-pb-muted">
                    <span>RAM: {p.ramMb / 1024} GB</span>
                    <span className="text-pb-mint/80">{p.id === "enthusiast" ? "ZGC Gen" : "G1GC"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white">Manual Memory Slider</label>
            <span className="font-mono text-xs text-pb-muted">{memoryGb} GB</span>
          </div>
          <input
            type="range"
            min={3072}
            max={maxMemoryMb}
            step={512}
            value={Math.min(settings.memoryMb, maxMemoryMb)}
            onChange={(e) =>
              setSettings({
                ...settings,
                memoryMb: Number(e.target.value),
                tuningPreset: "custom",
              })
            }
            className="mt-2 w-full accent-pb-cyan"
          />
          <div className="mt-1 flex justify-between text-[11px] text-pb-muted font-mono">
            <span>3 GB</span>
            <span>6 GB (Eco)</span>
            <span>8 GB (Std)</span>
            <span>12 GB (ZGC)</span>
            <span>16 GB</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-pb-muted">
            Active JVM Arguments (Auto-managed or custom)
          </label>
          <input
            type="text"
            value={settings.extraJvmArgs}
            onChange={(e) =>
              setSettings({
                ...settings,
                extraJvmArgs: e.target.value,
                tuningPreset: "custom",
              })
            }
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3 py-2 font-mono text-xs text-white focus:border-pb-cyan focus:outline-none"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-pb-muted">
            <DiscordLogo size={14} className="text-[#5865F2]" />
            Discord Crash Report Webhook URL (Optional)
          </label>
          <input
            type="text"
            value={settings.crashWebhookUrl ?? ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                crashWebhookUrl: e.target.value.trim() ? e.target.value : null,
              })
            }
            placeholder="https://discord.com/api/webhooks/... (for one-click crash report submission)"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-pb-bg px-3 py-2 font-mono text-xs text-white placeholder-pb-muted/60 focus:border-pb-cyan focus:outline-none"
          />
        </div>
      </section>

      {/* Server Connection & Window Behavior Options */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pb-mint/15 text-pb-mint">
              <Server size={18} />
            </div>
            <div>
              <div className="text-sm font-bold">Auto-Connect to `s2.petablocks.com` on Launch</div>
              <div className="text-xs text-pb-muted">
                Passes `--quickPlayMultiplayer s2.petablocks.com:25565` so you join the server directly.
              </div>
            </div>
          </div>

          <button
            onClick={() => setSettings({ ...settings, directConnect: !settings.directConnect })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
              settings.directConnect ? "bg-pb-cyan" : "bg-white/15"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-[#031617] transition ${
                settings.directConnect ? "translate-x-6" : "translate-x-1 bg-white"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pb-purple/15 text-pb-purple">
              <Cpu size={18} />
            </div>
            <div>
              <div className="text-sm font-bold">Hide Launcher While Playing Minecraft</div>
              <div className="text-xs text-pb-muted">
                Automatically hides the launcher window once Minecraft starts and restores it when you quit the game.
              </div>
            </div>
          </div>

          <button
            onClick={() => setSettings({ ...settings, closeOnLaunch: !settings.closeOnLaunch })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition ${
              settings.closeOnLaunch ? "bg-pb-cyan" : "bg-white/15"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-[#031617] transition ${
                settings.closeOnLaunch ? "translate-x-6" : "translate-x-1 bg-white"
              }`}
            />
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedNotice && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pb-mint">
            <CheckCircle2 size={15} /> Settings saved
          </span>
        )}
        <button
          onClick={handleSave}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-pb-cyan px-6 py-2.5 text-sm font-extrabold text-[#031617] hover:brightness-110"
        >
          <Save size={16} /> Save Settings
        </button>
      </div>
    </div>
  );
}
