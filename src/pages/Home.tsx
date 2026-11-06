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
} from "lucide-react";
import { INSTANCES, Instance } from "../instances";
import AccountCard from "../components/AccountCard";
import { MinecraftServerIcon } from "../components/MinecraftServerIcon";
import { Session, inTauri } from "../auth";
import {
  InstanceState,
  LauncherManifest,
  SyncProgress,
  getManifest,
  getSyncState,
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
}

export default function Home({ session, onSession }: Props) {
  const [selectedId, setSelectedId] = useState<string>("petablocks-s2");
  const selectedInstance = INSTANCES.find((i) => i.id === selectedId) ?? INSTANCES[0];

  // Server ping statuses for all instances
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatus>>({});

  // Active instance sync / manifest
  const [manifest, setManifest] = useState<LauncherManifest | null>(null);
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

  // Community / Crash / Discord
  const [discordStatus, setDiscordStatus] = useState<DiscordLinkStatus | null>(null);
  const [crashReport, setCrashReport] = useState<CrashReportInfo | null>(null);
  const [sendingCrash, setSendingCrash] = useState(false);
  const [crashSent, setCrashSent] = useState(false);

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

  // Update manifest and sync state when instance changes
  useEffect(() => {
    if (!selectedInstance.manifestUrl) return;
    getSyncState(selectedInstance.id).then(setSyncState).catch(() => {});
    if (inTauri) {
      getManifest(selectedInstance.id, selectedInstance.manifestUrl)
        .then(setManifest)
        .catch(() => {});
    }
  }, [selectedInstance.id, selectedInstance.manifestUrl]);

  // Subscribe to Tauri events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    onSyncProgress((p) => {
      if (p.instanceId === selectedInstance.id) setProgress(p);
    }).then((u) => unlisteners.push(u));
    onLaunchStatus((s) => setLaunchStatus(s)).then((u) => unlisteners.push(u));
    onGameState((st) => {
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
          setSyncError(`Game process exited unexpectedly with code ${code}. Check the Game Logs below for details.`);
          getLatestCrashReport(selectedInstance.id)
            .then((rep) => {
              if (rep) setCrashReport(rep);
            })
            .catch(() => {});
        }
      }
    }).then((u) => unlisteners.push(u));
    onGameLog((entry) => {
      setLogs((prev) => [...prev.slice(-999), entry]);
    }).then((u) => unlisteners.push(u));

    return () => {
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

  const latestVersion = manifest?.version ?? null;
  const isUpToDate =
    Boolean(syncState.installedVersion) &&
    (!latestVersion || syncState.installedVersion === latestVersion);
  const verifiedOnlineSession = Boolean(session && !session.offline && session.access_token);
  const betaDiscordReady = Boolean(discordStatus?.linked && discordStatus?.inGuild);

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Top Main Hero Split Showcase */}
      <div className="grid min-h-[380px] flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        {INSTANCES.slice(0, 2).map((inst) => {
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
                <span className="rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white backdrop-blur-md">
                  {inst.badge ?? "Instance"}
                </span>

                {/* Server Ping Badge */}
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold backdrop-blur-md ${
                    status?.online
                      ? "border border-pb-mint/30 bg-pb-mint/20 text-pb-mint"
                      : "border border-white/10 bg-black/60 text-pb-muted"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status?.online ? "animate-pulse bg-pb-mint" : "bg-neutral-500"
                    }`}
                  />
                  {status?.online
                    ? `${status.onlinePlayers} / ${status.maxPlayers} online`
                    : inst.serverAddress}
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
                        src="/cards/neoforge-icon.png"
                        alt="NeoForge"
                        className="h-4 w-4 shrink-0 rounded-xs object-contain"
                      />
                      <span>
                        {inst.neoforgeVersion
                          ? inst.neoforgeVersion
                          : inst.loader.replace(/NeoForge\s*|Forge\s*/i, "")}
                      </span>
                    </span>
                  </div>

                  {isPlayable ? (
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
                      ) : (
                        <>
                          <Play size={16} fill="currentColor" /> {inst.playLabel ?? "Play"}
                        </>
                      )}
                    </button>
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

      {/* Account Authentication & Quick Sync Bar */}
      <div className="mt-4">
        <AccountCard
          session={session}
          onSession={onSession}
          discordStatus={discordStatus}
          onDiscordStatus={setDiscordStatus}
          totalPlaytimeSeconds={syncState.totalPlaytimeSeconds}
          sessionsPlayed={syncState.sessionsPlayed}
        />
      </div>

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
    </div>
  );
}
