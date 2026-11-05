import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  DownloadCloud,
  Loader2,
  Play,
  Send,
  Terminal,
  Users,
} from "lucide-react";
import { INSTANCES } from "../instances";
import AccountCard from "../components/AccountCard";
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
import logo from "../assets/petablocks-logo-horizontal-512w.png";

interface Props {
  session: Session | null;
  onSession: (s: Session | null) => void;
}

export default function Home({ session, onSession }: Props) {
  const instance = INSTANCES[0];
  const [manifest, setManifest] = useState<LauncherManifest | null>(null);
  const [syncState, setSyncState] = useState<InstanceState>({
    installedVersion: null,
    disabledMods: [],
  });
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [launching, setLaunching] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<GameLogLine[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [discordStatus, setDiscordStatus] = useState<DiscordLinkStatus | null>(null);
  const [crashReport, setCrashReport] = useState<CrashReportInfo | null>(null);
  const [sendingCrash, setSendingCrash] = useState(false);
  const [crashSent, setCrashSent] = useState(false);

  useEffect(() => {
    getSyncState(instance.id).then(setSyncState).catch(() => {});
    if (inTauri) {
      getManifest(instance.id, instance.manifestUrl)
        .then(setManifest)
        .catch(() => {});
      pingServer(instance.serverAddress)
        .then(setServerStatus)
        .catch(() => {});
    }

    const pingInterval = setInterval(() => {
      if (inTauri) {
        pingServer(instance.serverAddress)
          .then(setServerStatus)
          .catch(() => {});
      }
    }, 30000);

    const unlisteners: (() => void)[] = [];
    onSyncProgress((p) => {
      if (p.instanceId === instance.id) setProgress(p);
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
        getSyncState(instance.id).then(setSyncState).catch(() => {});
        const code = Number(st.split(":")[1] ?? "0");
        if (code !== 0) {
          setShowLogs(true);
          setSyncError(`Game process exited unexpectedly with code ${code}. Check the Game Logs below for details.`);
          getLatestCrashReport(instance.id)
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
      clearInterval(pingInterval);
      unlisteners.forEach((u) => u());
    };
  }, [instance.id, instance.manifestUrl, instance.serverAddress]);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const next = await syncInstance(instance.id, instance.manifestUrl);
      setSyncState(next);
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePlay() {
    if (!session || session.offline || !session.access_token) return;
    setSyncError(null);
    setCrashReport(null);
    setLaunching(true);
    setLogs([]);
    try {
      if (!isUpToDate) {
        setLaunchStatus("Syncing modpack files before launch...");
        const next = await syncInstance(instance.id, instance.manifestUrl);
        setSyncState(next);
      }
      await launchInstance({
        instanceId: instance.id,
        minecraftVersion: instance.minecraftVersion,
        neoforgeVersion: manifest?.neoforge ?? instance.neoforgeVersion,
        serverAddress: instance.serverAddress,
        session,
      });
    } catch (e) {
      setSyncError(String(e));
      setLaunching(false);
      setLaunchStatus(null);
    }
  }

  async function handleSendCrashWebhook() {
    if (!crashReport) return;
    setSendingCrash(true);
    try {
      const s = await getSettings();
      await submitCrashWebhook({
        webhookUrl: s.crashWebhookUrl || "",
        playerName: session?.profile.name ?? "Unknown",
        instanceId: instance.id,
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
    <div className="mx-auto max-w-3xl">
      <img
        src={logo}
        alt="PETABLOCKS"
        className="mb-8 h-14 object-contain object-left"
        draggable={false}
      />

      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-pb-card p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-pb-cyan/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-pb-purple/10 blur-3xl" />
        <div className="relative">
          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                serverStatus?.online
                  ? "bg-pb-mint/15 text-pb-mint"
                  : "bg-white/10 text-pb-muted"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  serverStatus?.online ? "bg-pb-mint animate-pulse" : "bg-pb-muted"
                }`}
              />
              {instance.serverAddress}
              {serverStatus?.online && serverStatus.latencyMs !== null && (
                <span className="text-[11px] opacity-80">({serverStatus.latencyMs} ms)</span>
              )}
            </div>

            {serverStatus?.online && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pb-cyan/15 px-3 py-1 text-xs font-bold text-pb-cyan">
                <Users size={12} /> {serverStatus.onlinePlayers} / {serverStatus.maxPlayers} Online
              </span>
            )}

            {latestVersion && (
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-pb-muted">
                Modpack v{latestVersion} ({manifest?.mods.length ?? 0} client mods)
              </span>
            )}

            {(syncState.totalPlaytimeSeconds ?? 0) >= 60 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pb-purple/15 px-3 py-1 text-xs font-bold text-pb-purple">
                <Clock size={12} />{" "}
                {Math.floor((syncState.totalPlaytimeSeconds ?? 0) / 3600)}h{" "}
                {Math.floor(((syncState.totalPlaytimeSeconds ?? 0) % 3600) / 60)}m played
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-extrabold">{instance.name}</h1>
          <p className="mt-1 text-sm text-pb-muted">
            Minecraft {instance.minecraftVersion} - {instance.loader}
            {serverStatus?.motd ? ` • ${serverStatus.motd}` : ""}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={handlePlay}
              disabled={!verifiedOnlineSession || !betaDiscordReady || syncing || launching || gameRunning}
              className="pb-glow font-minecraft inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-pb-cyan px-8 py-3 text-xl tracking-wider text-[#031617] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {launching ? (
                <>
                  <Loader2 size={20} className="animate-spin" /> Launching...
                </>
              ) : gameRunning ? (
                <>
                  <CheckCircle2 size={20} /> Game Running
                </>
              ) : (
                <>
                  <Play size={20} fill="currentColor" /> Play
                </>
              )}
            </button>

            <button
              onClick={handleSync}
              disabled={syncing || launching || gameRunning || !inTauri}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-pb-cyan/40 bg-pb-cyan/15 px-5 py-3 text-sm font-extrabold text-pb-cyan transition hover:bg-pb-cyan/25 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Syncing Modpack...
                </>
              ) : isUpToDate ? (
                <>
                  <CheckCircle2 size={18} className="text-pb-mint" /> Synced (v{syncState.installedVersion})
                </>
              ) : (
                <>
                  <DownloadCloud size={18} />{" "}
                  {syncState.installedVersion
                    ? `Update to v${latestVersion ?? "latest"}`
                    : "Sync Modpack"}
                </>
              )}
            </button>

            {logs.length > 0 && (
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-pb-muted hover:text-white"
              >
                <Terminal size={15} /> {showLogs ? "Hide Logs" : "Game Logs"}
              </button>
            )}
          </div>

          {syncing && progress && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-pb-muted">
                <span>{progress.detail}</span>
                <span>{percent}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-pb-cyan transition-all duration-200"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {launchStatus && (
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-pb-cyan">
              <Loader2 size={13} className="animate-spin" /> {launchStatus}
            </p>
          )}

          {syncError && <p className="mt-3 text-xs text-red-400">{syncError}</p>}

          <p className="mt-3 text-xs text-pb-muted">
            {!verifiedOnlineSession
              ? "Sign in with a verified Microsoft account owning Minecraft: Java Edition to enable Play."
              : !discordStatus?.linked
              ? "Link your Discord account below to verify Closed Beta access and unlock Play."
              : !discordStatus?.inGuild
              ? "Join the official PETABLOCKS Discord server below to unlock Closed Beta access."
              : gameRunning
              ? `Connected to ${instance.name}. Have fun!`
              : "Ready to launch Minecraft 1.21.1 (NeoForge) and connect to s2.petablocks.com."}
          </p>
        </div>
      </section>

      {/* Crash Report Diagnostics Modal / Banner */}
      {crashReport && (
        <section className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={22} className="shrink-0 text-red-400" />
              <div>
                <h2 className="text-sm font-bold text-white">Minecraft Crashed — {crashReport.filename}</h2>
                <p className="mt-0.5 text-xs text-red-200">{crashReport.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(crashReport.content)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Copy size={13} /> Copy Crash Report
              </button>
              <button
                onClick={handleSendCrashWebhook}
                disabled={sendingCrash || crashSent}
                className="inline-flex items-center gap-1.5 rounded-lg bg-pb-cyan px-3 py-1.5 text-xs font-bold text-[#031617] hover:brightness-110 disabled:opacity-50"
              >
                <Send size={13} />{" "}
                {crashSent ? "Sent to Support" : sendingCrash ? "Sending..." : "Send to PETABLOCKS Support"}
              </button>
            </div>
          </div>
        </section>
      )}

      {showLogs && logs.length > 0 && (
        <section className="mt-6 rounded-2xl border border-white/10 bg-pb-card p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-pb-muted">
            <span>Live Game Output ({logs.length} lines)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const text = logs.map((l) => l.line).join("\n");
                  navigator.clipboard.writeText(text);
                }}
                className="inline-flex items-center gap-1 rounded bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Copy size={12} /> Copy All Logs
              </button>
              <button onClick={() => setLogs([])} className="hover:text-white">
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-72 select-text overflow-y-auto rounded-xl bg-pb-bg p-3 font-mono text-[11px] leading-relaxed">
            {logs.map((l, idx) => (
              <div key={idx} className={`select-text ${l.isError ? "text-red-400" : "text-pb-muted"}`}>
                {l.line}
              </div>
            ))}
          </div>
        </section>
      )}

      <AccountCard
        session={session}
        onSession={onSession}
        totalPlaytimeSeconds={syncState.totalPlaytimeSeconds ?? 0}
        sessionsPlayed={syncState.sessionsPlayed ?? 0}
        discordStatus={discordStatus}
        onDiscordStatus={setDiscordStatus}
      />
    </div>
  );
}
