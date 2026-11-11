import { ReactNode, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Cpu,
  DownloadCloud,
  FlaskConical,
  FolderOpen,
  Gauge,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { inTauri } from "../auth";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  LoadingState,
  PageHeader,
  SegmentedControl,
  Switch,
  cn,
} from "../components/ui";
import {
  JavaStatus,
  LauncherSettings,
  detectJava,
  getInstanceDir,
  getSystemMemoryMb,
  installJava21,
} from "../launch";
import { useLauncher, useManagedInstance } from "../state/LauncherProvider";

type PresetId = "eco" | "standard" | "enthusiast";

const G1_ARGS =
  "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC";

const PRESETS: { id: PresetId; name: string; desc: string; ramMb: number; jvmArgs: string }[] = [
  {
    id: "eco",
    name: "Light",
    desc: "For PCs with 8–12 GB of RAM. Leaves more memory for everything else.",
    ramMb: 6144,
    jvmArgs: G1_ARGS,
  },
  {
    id: "standard",
    name: "Recommended",
    desc: "The best balance for big Create builds and a full modpack.",
    ramMb: 8192,
    jvmArgs: `${G1_ARGS} -XX:+AlwaysPreTouch`,
  },
  {
    id: "enthusiast",
    name: "High-end",
    desc: "For PCs with 16 GB of RAM or more. Tuned for the fewest stutters.",
    ramMb: 12288,
    jvmArgs:
      "-XX:+UseZGC -XX:+ZGenerational -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
  },
];

const MIN_MEMORY_MB = 3072;
const MAX_MEMORY_CAP_MB = 16384;
const WEBHOOK_PREFIXES = ["https://discord.com/api/webhooks/", "https://discordapp.com/api/webhooks/"];
const FIELD_LABEL = "block text-xs font-semibold text-pb-muted";

const gb = (mb: number) => `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-0.5 text-xs text-pb-muted">{description}</div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const instance = useManagedInstance();
  const { settings, saveSettings } = useLauncher();

  // Edits apply to a local draft immediately and are saved automatically (debounced for typing).
  const [draft, setDraft] = useState<LauncherSettings | null>(settings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<LauncherSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(saveSettings);
  saveRef.current = saveSettings;

  const [java, setJava] = useState<JavaStatus | null>(null);
  const [installingJava, setInstallingJava] = useState(false);
  const [systemMemoryMb, setSystemMemoryMb] = useState(0);

  useEffect(() => {
    if (!draft && settings) setDraft(settings);
  }, [draft, settings]);

  useEffect(() => {
    getSystemMemoryMb()
      .then(setSystemMemoryMb)
      .catch(() => {});
    detectJava()
      .then(setJava)
      .catch(() => {});
    // Leaving the page must not drop an edit that is still waiting on its debounce.
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) saveRef.current(pending.current).catch(() => {});
    };
  }, []);

  async function commit(next: LauncherSettings, javaChanged: boolean) {
    pending.current = null;
    try {
      await saveSettings(next);
      setSaveState("saved");
      setError(null);
      if (javaChanged) setJava(await detectJava());
    } catch (e) {
      setSaveState("idle");
      setError(`Could not save settings: ${e}`);
    }
  }

  function change(patch: Partial<LauncherSettings>, debounceMs = 0) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaveState("saving");
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    const javaChanged = "customJavaPath" in patch;
    timer.current = setTimeout(() => commit(next, javaChanged), debounceMs);
  }

  async function handleInstallJava() {
    setInstallingJava(true);
    setError(null);
    try {
      setJava(await installJava21());
    } catch (e) {
      setError(String(e));
    } finally {
      setInstallingJava(false);
    }
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-3xl">
        <LoadingState>Loading settings…</LoadingState>
      </div>
    );
  }

  // The backend enforces the same 75%-of-RAM ceiling at launch.
  const maxMemoryMb =
    systemMemoryMb > 0
      ? Math.max(
          MIN_MEMORY_MB,
          Math.min(MAX_MEMORY_CAP_MB, Math.floor((systemMemoryMb * 0.75) / 512) * 512),
        )
      : MAX_MEMORY_CAP_MB;
  const memoryMb = Math.min(draft.memoryMb, maxMemoryMb);
  const webhook = draft.crashWebhookUrl ?? "";
  const webhookInvalid = webhook !== "" && !WEBHOOK_PREFIXES.some((p) => webhook.startsWith(p));
  const staging = draft.updateChannel === "staging";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Changes are saved automatically and apply the next time you press Play."
        actions={
          <>
            <span role="status" className="flex items-center gap-1.5 text-xs font-semibold text-pb-muted">
              {saveState === "saving" && (
                <>
                  <Loader2 size={13} className="animate-spin" /> Saving…
                </>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1.5 text-pb-mint">
                  <CheckCircle2 size={14} /> Saved
                </span>
              )}
            </span>
            <Button
              icon={<FolderOpen size={15} />}
              disabled={!inTauri}
              onClick={() => getInstanceDir(instance.id).catch((e) => setError(String(e)))}
            >
              Open game folder
            </Button>
          </>
        }
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader
          icon={<Gauge size={20} />}
          title="Performance"
          description="How much memory Minecraft may use. More is not always better: leave room for your browser and Discord."
        />

        <div
          role="radiogroup"
          aria-label="Performance preset"
          className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {PRESETS.map((p) => {
            const active = draft.tuningPreset === p.id;
            const tooBig = p.ramMb > maxMemoryMb;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={tooBig}
                onClick={() =>
                  change({ tuningPreset: p.id, memoryMb: p.ramMb, extraJvmArgs: p.jvmArgs })
                }
                className={cn(
                  "flex flex-col rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                  active
                    ? "border-pb-cyan bg-pb-cyan/10 ring-1 ring-pb-cyan"
                    : "border-white/10 bg-pb-bg hover:border-white/20 hover:bg-white/5",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("text-sm font-extrabold", active ? "text-pb-cyan" : "text-white")}>
                    {p.name}
                  </span>
                  <span className="font-mono text-xs text-pb-muted">{gb(p.ramMb)}</span>
                </span>
                <span className="mt-1 text-xs leading-relaxed text-pb-muted">
                  {tooBig ? "Needs more memory than this PC can spare." : p.desc}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <label htmlFor="memory-slider" className="text-xs font-bold text-white">
              Memory for Minecraft
              {draft.tuningPreset === "custom" && (
                <span className="ml-2 font-normal text-pb-muted">Custom</span>
              )}
            </label>
            <span className="font-mono text-xs text-pb-cyan">
              {gb(memoryMb)}
              {systemMemoryMb > 0 && (
                <span className="text-pb-muted"> of {Math.round(systemMemoryMb / 1024)} GB installed</span>
              )}
            </span>
          </div>
          <input
            id="memory-slider"
            type="range"
            min={MIN_MEMORY_MB}
            max={maxMemoryMb}
            step={512}
            value={memoryMb}
            aria-valuetext={gb(memoryMb)}
            onChange={(e) =>
              change({ memoryMb: Number(e.target.value), tuningPreset: "custom" }, 300)
            }
            className="mt-2 w-full accent-pb-cyan"
          />
          <div className="mt-1 flex justify-between font-mono text-2xs text-pb-muted">
            <span>{gb(MIN_MEMORY_MB)}</span>
            <span>{gb(maxMemoryMb)} max for this PC</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          tone="purple"
          icon={<SlidersHorizontal size={20} />}
          title="Game"
          description="What happens when you press Play."
        />
        <div className="mt-5 divide-y divide-white/10">
          <SettingRow
            title="Join the server automatically"
            description={`Skip the title screen and connect straight to the server you launched (for example ${instance.serverAddress}).`}
          >
            <Switch
              checked={draft.directConnect}
              onChange={(next) => change({ directConnect: next })}
              label="Join the server automatically"
            />
          </SettingRow>
          <SettingRow
            title="Hide the launcher while playing"
            description="Minimises the launcher when Minecraft starts and brings it back when you quit."
          >
            <Switch
              checked={draft.closeOnLaunch}
              onChange={(next) => change({ closeOnLaunch: next })}
              label="Hide the launcher while playing"
            />
          </SettingRow>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Cpu size={20} />}
          title="Java"
          description="Minecraft 1.21 needs Java 21. The launcher installs its own copy when you first play."
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={13} />}
                onClick={() =>
                  detectJava()
                    .then(setJava)
                    .catch(() => {})
                }
              >
                Check again
              </Button>
              {java && !java.found && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={installingJava}
                  disabled={!inTauri}
                  icon={<DownloadCloud size={14} />}
                  onClick={handleInstallJava}
                >
                  {installingJava ? "Installing…" : "Install Java 21 now"}
                </Button>
              )}
            </>
          }
        />
        <div className="mt-4 rounded-xl border border-white/5 bg-pb-bg p-4 text-xs">
          {!java ? (
            <span className="text-pb-muted">Checking for Java…</span>
          ) : java.found ? (
            <div className="select-text space-y-1">
              <div className="flex flex-wrap items-center gap-2 font-bold text-pb-mint">
                <CheckCircle2 size={15} /> Java 21 is ready
                <span className="font-normal text-pb-muted">
                  {java.source === "managed"
                    ? "Installed by the launcher"
                    : java.source === "custom"
                      ? "Using your custom path"
                      : "Found on this PC"}
                </span>
              </div>
              <div className="truncate font-mono text-2xs text-pb-muted">{java.path}</div>
            </div>
          ) : (
            <span className="text-pb-muted">
              Java 21 is not installed yet. It is downloaded automatically the first time you press
              Play, or you can install it now.
            </span>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          tone="amber"
          icon={<FlaskConical size={20} />}
          title="Updates"
          description="Stable is right for almost everyone. Staging gets launcher and modpack builds early and may break."
          actions={
            <SegmentedControl<"stable" | "staging">
              label="Update channel"
              className="bg-pb-bg"
              value={staging ? "staging" : "stable"}
              onChange={(value) => change({ updateChannel: value })}
              options={[
                { value: "stable", label: "Stable" },
                { value: "staging", label: "Staging" },
              ]}
            />
          }
        />
        {staging && (
          <Alert tone="warning" className="mt-4">
            You are on the staging channel. Expect unfinished builds, and switch back to Stable if
            something stops working.
          </Alert>
        )}
      </Card>

      <details className="group rounded-2xl border border-white/10 bg-pb-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-6">
          <span>
            <span className="block text-sm font-bold text-white">Advanced</span>
            <span className="block text-xs text-pb-muted">
              Java arguments, a custom Java install and a fallback for crash reports. Most players
              never need these.
            </span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-pb-muted transition group-open:rotate-180" />
        </summary>
        <div className="space-y-5 px-6 pb-6">
          <div>
            <label htmlFor="jvm-args" className={FIELD_LABEL}>
              Java arguments
            </label>
            <input
              id="jvm-args"
              type="text"
              spellCheck={false}
              value={draft.extraJvmArgs}
              onChange={(e) => change({ extraJvmArgs: e.target.value, tuningPreset: "custom" }, 600)}
              className="pb-input mt-1.5 font-mono"
            />
            <p className="mt-1 text-2xs text-pb-muted">
              Set by the performance preset. Editing them switches the preset to Custom.
            </p>
          </div>
          <div>
            <label htmlFor="java-path" className={FIELD_LABEL}>
              Custom Java path
            </label>
            <input
              id="java-path"
              type="text"
              spellCheck={false}
              value={draft.customJavaPath ?? ""}
              onChange={(e) =>
                change({ customJavaPath: e.target.value.trim() ? e.target.value : null }, 600)
              }
              placeholder="Leave empty to use the launcher's Java 21"
              className="pb-input mt-1.5 font-mono"
            />
          </div>
          <div>
            <label htmlFor="crash-webhook" className={FIELD_LABEL}>
              Fallback Discord webhook for reports (optional)
            </label>
            <input
              id="crash-webhook"
              type="url"
              spellCheck={false}
              value={webhook}
              aria-invalid={webhookInvalid}
              aria-describedby="crash-webhook-help"
              onChange={(e) => change({ crashWebhookUrl: e.target.value.trim() || null }, 600)}
              placeholder="https://discord.com/api/webhooks/…"
              className="pb-input mt-1.5 font-mono"
            />
            <p
              id="crash-webhook-help"
              className={cn("mt-1 text-2xs", webhookInvalid ? "text-amber-300" : "text-pb-muted")}
            >
              {webhookInvalid
                ? "This is not a Discord webhook URL, so it will not be used. It must start with https://discord.com/api/webhooks/."
                : "Crash reports and feedback go to the PETABLOCKS team. This webhook is only used if that service cannot be reached."}
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}
