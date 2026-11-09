import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DownloadCloud,
  Loader2,
  Play,
  Terminal,
  Users,
  Wifi,
  WifiOff,
  ChevronRight,
  Sparkles,
  FileText,
  X,
  RefreshCw,
} from "lucide-react";
import { INSTANCES, Instance } from "../instances";
import AccountCard from "../components/AccountCard";
import { MinecraftServerIcon } from "../components/MinecraftServerIcon";
import { InlineMarkdown, parseChangelog } from "./News";
import { Session, inTauri } from "../auth";
import {
  InstanceState,
  LauncherManifest,
  SyncProgress,
  formatPlaytime,
  getChangelog,
  getManifest,
  getSyncState,
  onPlaytimeUpdated,
  onSyncProgress,
  syncInstance,
} from "../sync";
import {
  GameLogLine,
  getSettings,
  launchInstance,
  onGameLog,
  onGameState,
  onLaunchStatus,
} from "../launch";
import {
  CrashReportInfo,
  DiscordLinkStatus,
  ServerStatus,
  getLatestCrashReport,
  pingServer,
  submitCrashWebhook,
} from "../community";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
  discordStatus: DiscordLinkStatus | null;
  onDiscordStatus: (status: DiscordLinkStatus | null) => void;
  selectedInstanceId?: string;
  onSelectInstance?: (id: string) => void;
}

export default function Home({
  session,
  onSession,
  discordStatus,
  onDiscordStatus,
  selectedInstanceId,
  onSelectInstance,
}: Props) {
  const [internalSelectedId, setInternalSelectedId] = useState<string>("petablocks-s2");
  const selectedId = selectedInstanceId ?? internalSelectedId;
  const setSelectedId = onSelectInstance ?? setInternalSelectedId;
  const selectedInstance = INSTANCES.find((i) => i.id === selectedId) ?? INSTANCES[0];

  // Server ping statuses for all instances
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});

  // Active instance sync / manifest
  const [manifest, setManifest] = useState<LauncherManifest | null>(null);
  const [instanceStates, setInstanceStates] = useState<Record<string, InstanceState>>({});
  const [syncState, setSyncState] = useState<InstanceState>({
    installedVersion: null,
    disabledMods: [],
  });
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Launch & Game State
  const [launching, setLaunching] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<GameLogLine[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  // Crash
  const [crashReport, setCrashReport] = useState<CrashReportInfo | null>(null);
  const [sendingCrash, setSendingCrash] = useState(false);
  const [crashSent, setCrashSent] = useState(false);

  // Modpack changelog modal & info
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [changelogContent, setChangelogContent] = useState<string | null>(null);
  const [loadingChangelog, setLoadingChangelog] = useState(false);

  // Ping servers periodically
  useEffect(() => {
    async function pingAll() {
      if (!inTauri) return;
      for (const inst of INSTANCES) {
        if (!inst.serverAddress) continue;
        pingServer(inst.serverAddress)
          .then((st) => {
            setServerStatuses((prev) => ({ ...prev, [inst.id]: st }));
          })
          .catch(() => {});
      }
    }

    pingAll();
    const interval = setInterval(pingAll, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load initial sync states for all instances
  useEffect(() => {
    for (const inst of INSTANCES) {
      getSyncState(inst.id)
        .then((st) => {
          setInstanceStates((prev) => ({ ...prev, [inst.id]: st }));
        })
        .catch(() => {});
    }
  }, []);

  // Update manifest and sync state when instance changes
  useEffect(() => {
    if (!selectedInstance.manifestUrl) return;
    setManifest(null);
    getSyncState(selectedInstance.id)
      .then((st) => {
        setSyncState(st);
        setInstanceStates((prev) => ({ ...prev, [selectedInstance.id]: st }));
      })
      .catch(() => {});
    if (inTauri) {
      getManifest(selectedInstance.id, selectedInstance.manifestUrl)
        .then((m) => {
          setManifest(m);
        })
        .catch(() => {});
    }
  }, [selectedInstance.id, selectedInstance.manifestUrl]);

  // Subscribe to Tauri events
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const register = (p: Promise<() => void>) => {
      p.then((u) => {
        if (disposed) u();
        else unlisteners.push(u);
      }).catch(() => {});
    };

    register(
      onSyncProgress((p) => {
        if (!disposed && p.instanceId === selectedInstance.id) setProgress(p);
      })
    );
    register(
      onPlaytimeUpdated((instId, st) => {
        if (disposed) return;
        setInstanceStates((prev) => ({ ...prev, [instId]: st }));
        if (instId === selectedInstance.id) {
          setSyncState(st);
        }
      })
    );
    register(
      onLaunchStatus((s) => {
        if (!disposed) setLaunchStatus(s);
      })
    );
    register(
      onGameState((st) => {
        if (disposed) return;
        if (st === "running") {
          setGameRunning(true);
          setLaunching(false);
          setCrashReport(null);
          setCrashSent(false);
        } else if (st.startsWith("stopped")) {
          setGameRunning(false);
          setLaunching(false);
          setLaunchStatus(null);
          getSyncState(selectedInstance.id).then(setSyncState).catch(() => {});
          const code = Number(st.split(":")[1] ?? "0");
          if (code !== 0) {
            setShowLogs(true);
            setSyncError(
              `Game process exited unexpectedly with code ${code}. Check the Game Logs below for details.`
            );
            getLatestCrashReport(selectedInstance.id)
              .then((rep) => {
                if (!disposed && rep) setCrashReport(rep);
              })
              .catch(() => {});
          }
        }
      })
    );
    register(
      onGameLog((entry) => {
        if (!disposed) setLogs((prev) => [...prev.slice(-999), entry]);
      })
    );

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, [selectedInstance.id]);

  async function handleSync() {
    if (selectedInstance.status !== "playable" || !selectedInstance.manifestUrl) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const next = await syncInstance(selectedInstance.id, selectedInstance.manifestUrl);
      setSyncState(next);
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePlay() {
    if (selectedInstance.status !== "playable") return;
    if (!session || session.offline || !session.access_token) {
      setSyncError("Sign in with a verified Microsoft account owning Minecraft: Java Edition first.");
      return;
    }
    if (discordStatus && (!discordStatus.linked || !discordStatus.inGuild)) {
      setSyncError("Discord linking and Closed Beta membership required to play.");
      return;
    }
    setLaunching(true);
    setSyncError(null);
    setLogs([]);
    try {
      if (selectedInstance.manifestUrl) {
        setLaunchStatus("Checking modpack updates...");
        const next = await syncInstance(selectedInstance.id, selectedInstance.manifestUrl);
        setSyncState(next);
      }

      setLaunchStatus("Preparing Java 21 runtime & NeoForge...");
      await launchInstance({
        instanceId: selectedInstance.id,
        minecraftVersion: selectedInstance.minecraftVersion,
        neoforgeVersion: selectedInstance.neoforgeVersion ?? "21.1.259",
        serverAddress: selectedInstance.serverAddress,
        session,
      });
    } catch (e) {
      setSyncError(String(e));
      setLaunching(false);
      setLaunchStatus(null);
    }
  }

  async function handleSendCrashReport() {
    if (!crashReport) return;
    setSendingCrash(true);
    try {
      const s = await getSettings();
      await submitCrashWebhook({
        webhookUrl: s.crashWebhookUrl || "",
        playerName: session?.profile.name ?? "Unknown",
        playerUuid: session?.profile.uuid ?? "",
        instanceId: selectedInstance.id,
        summary: crashReport.summary,
        logSnippet: crashReport.content,
      });
      setCrashSent(true);
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setSendingCrash(false);
    }
  }

  async function handleOpenChangelog() {
    setShowChangelogModal(true);
    if (!changelogContent) {
      setLoadingChangelog(true);
      try {
        const url =
          selectedInstance.changelogUrl ??
          "https://github.com/Petablocks/pb-launcher/releases/latest/download/CHANGELOG.md";
        const text = await getChangelog(selectedInstance.id, url);
        setChangelogContent(text);
      } catch (err) {
        setChangelogContent(`Unable to load release notes: ${err}`);
      } finally {
        setLoadingChangelog(false);
      }
    }
  }

  const latestVersion = manifest?.version ?? null;
  const isUpToDate =
    Boolean(syncState.installedVersion) &&
    (!latestVersion || syncState.installedVersion === latestVersion);
  const hasUpdate = Boolean(latestVersion && syncState.installedVersion && syncState.installedVersion !== latestVersion);
  const needsInitialInstall = Boolean(latestVersion && !syncState.installedVersion);
  const verifiedOnlineSession = Boolean(session && !session.offline && session.access_token);
  const betaDiscordReady = Boolean(discordStatus?.linked && discordStatus?.inGuild);

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col">
      {/* 2x2 Multi-Instance Modpack Grid */}
      <div className="grid min-h-[500px] flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {INSTANCES.map((inst) => {
          const isSelected = inst.id === selectedId;
          const status = serverStatuses[inst.id];
          const isPlayable = inst.status === "playable";

          return (
            <div
              key={inst.id}
              onClick={() => setSelectedId(inst.id)}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-300 ${
                isSelected
                  ? "border-pb-cyan/80 ring-2 ring-pb-cyan/30 shadow-[0_0_30px_rgba(15,205,248,0.2)]"
                  : "border-white/10 hover:border-white/30 cursor-pointer"
              }`}
            >
              {/* Background Art */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url(${inst.bgImage})` }}
              />

              {/* Ambient Vignette Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#060a12] via-[#060a12]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#060a12]/70 via-transparent to-[#060a12]/70" />

              {/* Top Meta Header */}
              <div className="relative z-10 flex items-center justify-between p-5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white backdrop-blur-md">
                    {inst.badge ?? "Instance"}
                  </span>
                  {/* Modpack Update Pill (if playable and update available) */}
                  {isPlayable && hasUpdate && isSelected && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-300 backdrop-blur-md animate-pulse">
                      <Sparkles size={11} /> Update v{latestVersion}
                    </span>
                  )}
                  {isPlayable && isUpToDate && isSelected && syncState.installedVersion && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-pb-mint/30 bg-pb-mint/10 px-2.5 py-0.5 text-[11px] font-bold text-pb-mint backdrop-blur-md">
                      <CheckCircle2 size={11} /> v{syncState.installedVersion}
                    </span>
                  )}
                </div>

                {/* Server Ping Badge */}
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-md transition-colors ${
                    status?.online
                      ? "border border-pb-mint/30 bg-pb-mint/20 text-pb-mint shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                      : "border border-white/10 bg-black/60 text-pb-muted"
                  }`}
                  title={
                    status?.online
                      ? `${status.motd ? `${status.motd}\n` : ""}Latency: ${status.latencyMs ?? "?"}ms\nPlayers: ${status.onlinePlayers} / ${status.maxPlayers}`
                      : `${inst.serverAddress} (offline or unreachable)`
                  }
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status?.online ? "animate-pulse bg-pb-mint" : "bg-neutral-500"
                    }`}
                  />
                  {status?.online ? (
                    <span className="flex items-center gap-1.5">
                      <span>{status.onlinePlayers} / {status.maxPlayers} online</span>
                      {status.latencyMs != null && (
                        <span className="text-[10px] opacity-75 font-mono">
                          • {status.latencyMs}ms
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>{inst.serverAddress}</span>
                  )}
                </div>
              </div>

              {/* Center Floating Modpack Logo */}
              <div className="relative z-10 flex flex-1 items-center justify-center p-4">
                <img
                  src={inst.logoImage}
                  alt={inst.name}
                  className="max-h-24 w-auto object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.9)] transition-transform duration-300 group-hover:scale-105"
                  draggable={false}
                />
              </div>

              {/* Bottom Details & Launch Panel */}
              <div className="relative z-10 border-t border-white/10 bg-black/50 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-pb-muted">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white/90">
                      <MinecraftServerIcon size={16} />
                      <span>{inst.minecraftVersion}</span>
                    </span>
                    <span className="text-white/20">•</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white/90">
                      <img
                        src={inst.loaderIcon ?? "/cards/neoforge-icon.png"}
                        alt={inst.loader}
                        className="h-4 w-4 shrink-0 rounded-xs object-contain"
                      />
                      <span>
                        {inst.loaderVersion
                          ? inst.loaderVersion
                          : inst.neoforgeVersion
                          ? inst.neoforgeVersion
                          : inst.loader.replace(/NeoForge\s*|Forge\s*/i, "")}
                      </span>
                    </span>
                    {isPlayable && (
                      <>
                        <span className="text-white/20">•</span>
                        <span
                          className="inline-flex items-center gap-1 font-semibold text-pb-cyan"
                          title="Total Playtime & Sessions on this modpack"
                        >
                          <Clock size={13} />
                          <span>
                            {formatPlaytime(
                              (isSelected ? syncState : instanceStates[inst.id])
                                ?.totalPlaytimeSeconds ?? 0
                            )}
                          </span>
                          <span className="text-pb-muted">
                            ({(isSelected ? syncState : instanceStates[inst.id])?.sessionsPlayed ?? 0}{" "}
                            {((isSelected ? syncState : instanceStates[inst.id])?.sessionsPlayed ?? 0) ===
                            1
                              ? "session"
                              : "sessions"}
                            )
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  {isPlayable ? (
                    <div className="flex items-center gap-2">
                      {isSelected && hasUpdate && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(inst.id);
                            handleSync();
                          }}
                          disabled={syncing || launching || gameRunning}
                          title="Download & Apply Modpack Update"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3.5 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                          <span>Update</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(inst.id);
                          handlePlay();
                        }}
                        disabled={!verifiedOnlineSession || !betaDiscordReady || syncing || launching || gameRunning}
                        className="font-minecraft inline-flex cursor-pointer items-center gap-2 rounded-xl bg-pb-cyan px-6 py-2.5 text-base font-extrabold tracking-wider text-[#031617] shadow-lg shadow-pb-cyan/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {launching && isSelected ? (
                          <>
                            <Loader2 size={16} className="animate-spin" /> Launching
                          </>
                        ) : gameRunning && isSelected ? (
                          <>
                            <CheckCircle2 size={16} /> Running
                          </>
                        ) : isSelected && hasUpdate ? (
                          <>
                            <DownloadCloud size={16} /> Update & Play
                          </>
                        ) : isSelected && needsInitialInstall ? (
                          <>
                            <DownloadCloud size={16} /> Install & Play
                          </>
                        ) : (
                          <>
                            <Play size={16} fill="currentColor" /> {inst.playLabel ?? "Play"}
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-pb-muted">
                      <Clock size={14} /> {inst.playLabel ?? "Coming Soon"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modpack Update Banner (when selected instance has an update available) */}
      {selectedInstance.status === "playable" && hasUpdate && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-[#0e1726] to-[#0a101d] p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-white">Modpack Update Available</span>
                <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                  v{latestVersion}
                </span>
                {syncState.installedVersion && (
                  <span className="text-xs text-pb-muted">
                    (installed: v{syncState.installedVersion})
                  </span>
                )}
              </div>
              <p className="text-xs text-pb-muted">
                New features, mod additions and optimizations ready for {selectedInstance.name}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenChangelog}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10 hover:text-white"
            >
              <FileText size={14} />
              <span>Changelog</span>
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || launching || gameRunning}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-black shadow-md shadow-amber-400/20 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Updating...
                </>
              ) : (
                <>
                  <DownloadCloud size={14} /> Update Now
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Syncing Progress Bar (if in progress) */}
      {syncing && progress && (
        <div className="mt-4 rounded-xl border border-pb-cyan/30 bg-pb-cyan/10 p-3">
          <div className="flex justify-between text-xs font-bold text-white">
            <span className="flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-pb-cyan" /> {progress.detail}
            </span>
            <span className="text-pb-cyan">{percent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full bg-pb-cyan transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error or Launch Status Alerts */}
      {syncError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertTriangle size={15} className="shrink-0 text-red-400" />
          <span>{syncError}</span>
        </div>
      )}
      {launchStatus && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-pb-cyan/30 bg-pb-cyan/10 p-3 text-xs text-pb-cyan">
          <Loader2 size={15} className="animate-spin shrink-0" />
          <span>{launchStatus}</span>
        </div>
      )}

      {/* Crash Reporter Bar (if crash occurred) */}
      {crashReport && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-red-300">Minecraft Crash Detected</h4>
              <p className="text-xs text-pb-muted">{crashReport.summary}</p>
            </div>
            <button
              onClick={handleSendCrashReport}
              disabled={sendingCrash || crashSent}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {sendingCrash ? <Loader2 size={13} className="animate-spin" /> : <Terminal size={13} />}
              {crashSent ? "Report Sent" : "Send Crash to Staff"}
            </button>
          </div>
        </div>
      )}

      {/* Logs Drawer */}
      {showLogs && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/80 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-white">Live Game Logs</span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-xs text-pb-muted hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="h-44 overflow-y-auto font-mono text-[11px] text-pb-muted">
            {logs.map((l, i) => (
              <div key={i} className={l.isError ? "text-red-400" : ""}>
                {l.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changelog Modal */}
      {showChangelogModal && (
        <div
          onClick={() => setShowChangelogModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#0c1322] shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-pb-cyan" />
                <h3 className="text-base font-extrabold text-white">
                  {selectedInstance.name} — Release Notes
                </h3>
              </div>
              <button
                onClick={() => setShowChangelogModal(false)}
                className="cursor-pointer rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 font-sans text-xs leading-relaxed text-white/80">
              {loadingChangelog ? (
                <div className="flex flex-col items-center justify-center py-12 text-pb-muted">
                  <Loader2 size={24} className="animate-spin text-pb-cyan mb-2" />
                  <span>Loading release notes...</span>
                </div>
              ) : changelogContent ? (
                <div className="space-y-4">
                  {parseChangelog(changelogContent).map((rel, idx) => (
                    <div
                      key={`${rel.version}-${idx}`}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="font-mono text-xs font-extrabold text-pb-cyan">
                          v{rel.version}
                        </span>
                        {rel.date && <span className="text-[11px] text-pb-muted">{rel.date}</span>}
                      </div>
                      <div className="mt-2.5 space-y-2.5">
                        {rel.sections.map((sec) => (
                          <div key={sec.title}>
                            <h4 className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-pb-mint">
                              {sec.title}
                            </h4>
                            <ul className="list-disc space-y-1 pl-5 text-xs text-white/85">
                              {sec.items.map((item, i) => (
                                <li key={i}>
                                  <InlineMarkdown text={item.heading} />
                                  {item.subItems.length > 0 && (
                                    <ul className="mt-0.5 list-circle space-y-0.5 pl-4 text-[11px] text-pb-muted">
                                      {item.subItems.map((sub, j) => (
                                        <li key={j}>
                                          <InlineMarkdown text={sub} />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-6 py-3">
              <span className="text-[11px] text-pb-muted">
                {latestVersion ? `Latest release: v${latestVersion}` : "Always up to date"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChangelogModal(false)}
                  className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Close
                </button>
                {hasUpdate && (
                  <button
                    onClick={() => {
                      setShowChangelogModal(false);
                      handleSync();
                    }}
                    disabled={syncing || launching || gameRunning}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-pb-cyan px-4 py-2 text-xs font-extrabold text-[#031617] hover:brightness-110 disabled:opacity-50"
                  >
                    <DownloadCloud size={14} /> Update Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
