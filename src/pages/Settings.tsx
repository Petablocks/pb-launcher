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
import { openPath } from "@tauri-apps/plugin-opener";
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

  useEffect(() => {
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

  async function handleOpenInstanceFolder() {
    try {
      const dir = await getInstanceDir(instance.id);
      await openPath(dir);
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

      {/* Memory Allocation & JVM Flags */}
      <section className="rounded-2xl border border-white/10 bg-pb-card p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold">Memory Allocation (RAM)</label>
            <span className="rounded-lg bg-pb-cyan/15 px-2.5 py-1 text-xs font-extrabold text-pb-cyan">
              {settings.memoryMb} MB ({memoryGb} GB)
            </span>
          </div>
          <p className="mt-1 text-xs text-pb-muted">
            6 GB – 8 GB is recommended for PETABLOCKS Season 2 (160 mods + Create contraptions).
          </p>
          <input
            type="range"
            min={3072}
            max={16384}
            step={512}
            value={settings.memoryMb}
            onChange={(e) => setSettings({ ...settings, memoryMb: Number(e.target.value) })}
            className="mt-3 w-full accent-pb-cyan"
          />
          <div className="mt-1 flex justify-between text-[11px] text-pb-muted">
            <span>3 GB</span>
            <span>6 GB (Recommended)</span>
            <span>8 GB</span>
            <span>12 GB</span>
            <span>16 GB</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-pb-muted">Additional JVM Arguments</label>
          <input
            type="text"
            value={settings.extraJvmArgs}
            onChange={(e) => setSettings({ ...settings, extraJvmArgs: e.target.value })}
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
