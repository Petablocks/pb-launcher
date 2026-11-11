import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Session, inTauri, restoreSession } from "../auth";
import {
  CrashReportInfo,
  DiscordLinkStatus,
  LauncherUpdateInfo,
  ServerStatus,
  checkDiscordLink,
  checkLauncherUpdate,
  getLatestCrashReport,
  installLauncherUpdate,
  pingServer,
  submitCrashWebhook,
} from "../community";
import {
  Announcement,
  BUNDLED_CONFIG,
  INSTANCES,
  Instance,
  LauncherConfig,
  getLauncherConfig,
} from "../instances";
import {
  LauncherSettings,
  getRunningInstances,
  getSettings,
  launchInstance,
  onGameLog,
  onGameState,
  onLaunchStatus,
  saveSettings as persistSettings,
  stopGame as invokeStopGame,
} from "../launch";
import {
  InstanceState,
  LauncherManifest,
  SYNC_CANCELLED,
  SyncProgress,
  cancelSync as invokeCancelSync,
  getManifest,
  getSyncState,
  onPlaytimeUpdated,
  onSyncProgress,
  syncInstance,
} from "../sync";
import { APP_VERSION } from "../version";
import { getPlayBlocker } from "./access";
import { appendLogs, clearLogs } from "./logStore";

export type InstancePhase = "idle" | "syncing" | "launching" | "running";

/** Everything the UI knows about one instance. Survives tab switches. */
export interface InstanceRuntime {
  state: InstanceState;
  manifest: LauncherManifest | null;
  phase: InstancePhase;
  /** Non-null only while files are being verified or downloaded. */
  progress: SyncProgress | null;
  statusMessage: string | null;
  error: string | null;
  crash: CrashReportInfo | null;
  crashSending: boolean;
  crashSent: boolean;
}

const EMPTY_STATE: InstanceState = {
  installedVersion: null,
  disabledMods: [],
  totalPlaytimeSeconds: 0,
  sessionsPlayed: 0,
  lastPlayedEpoch: null,
};

const EMPTY_RUNTIME: InstanceRuntime = {
  state: EMPTY_STATE,
  manifest: null,
  phase: "idle",
  progress: null,
  statusMessage: null,
  error: null,
  crash: null,
  crashSending: false,
  crashSent: false,
};

type RuntimeMap = Record<string, InstanceRuntime>;
type RuntimeAction = { id: string; patch: Partial<InstanceRuntime> };

function runtimeReducer(state: RuntimeMap, action: RuntimeAction): RuntimeMap {
  return { ...state, [action.id]: { ...(state[action.id] ?? EMPTY_RUNTIME), ...action.patch } };
}

export interface VersionInfo {
  installedVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
  needsInstall: boolean;
}

export function getVersionInfo(rt: InstanceRuntime): VersionInfo {
  const installedVersion = rt.state.installedVersion;
  const latestVersion = rt.manifest?.version ?? null;
  return {
    installedVersion,
    latestVersion,
    hasUpdate: Boolean(latestVersion && installedVersion && installedVersion !== latestVersion),
    needsInstall: Boolean(latestVersion && !installedVersion),
  };
}

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SERVER_PING_INTERVAL_MS = 30 * 1000;
const DISCORD_POLL_INTERVAL_MS = 8 * 1000;
const SELECTED_INSTANCE_KEY = "pb_active_instance";

interface LauncherContextValue {
  instances: Instance[];
  /** One-line headline shown in the footer. */
  ticker: string;
  announcements: Announcement[];
  selectedInstance: Instance;
  selectInstance: (id: string) => void;

  session: Session | null;
  setSession: (s: Session | null) => void;
  /** True until the cached session restore attempt has finished. */
  restoringSession: boolean;
  discordStatus: DiscordLinkStatus | null;
  refreshDiscord: () => Promise<DiscordLinkStatus | null>;

  runtimeOf: (instanceId: string) => InstanceRuntime;
  /** The instance currently syncing, launching or running, if any. */
  activeInstanceId: string | null;
  serverStatus: Record<string, ServerStatus>;
  setInstanceState: (instanceId: string, state: InstanceState) => void;
  refreshInstance: (inst: Instance) => Promise<void>;

  play: (inst: Instance) => Promise<void>;
  sync: (inst: Instance) => Promise<boolean>;
  cancelSync: (inst: Instance) => void;
  stopGame: (inst: Instance) => void;
  dismissError: (inst: Instance) => void;
  dismissCrash: (inst: Instance) => void;
  sendCrashReport: (inst: Instance) => Promise<void>;

  /** The account dialog is opened from several places (sidebar, Play blockers). */
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;

  /** Launcher-wide notice from the backend (not tied to an instance). */
  notice: string | null;

  settings: LauncherSettings | null;
  saveSettings: (next: LauncherSettings) => Promise<void>;

  updateInfo: LauncherUpdateInfo | null;
  checkingUpdate: boolean;
  installingUpdate: boolean;
  updateError: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;

  totalPlaytimeSeconds: number;
  totalSessions: number;
}

const LauncherContext = createContext<LauncherContextValue | null>(null);

export function useLauncher(): LauncherContextValue {
  const ctx = useContext(LauncherContext);
  if (!ctx) throw new Error("useLauncher must be used inside <LauncherProvider>");
  return ctx;
}

/**
 * The instance the management tabs (Mods, Packs, Screenshots, News) operate on: the selected
 * instance when it is installable, otherwise the first playable one.
 */
export function useManagedInstance(): Instance {
  const { instances, selectedInstance } = useLauncher();
  if (selectedInstance.status === "playable") return selectedInstance;
  return instances.find((i) => i.status === "playable") ?? selectedInstance;
}

export function LauncherProvider({ children }: { children: ReactNode }) {
  // Starts from the bundled config and switches to the remote copy once the backend has it.
  const [config, setConfig] = useState<LauncherConfig>(BUNDLED_CONFIG);
  const instances = config.instances;
  useEffect(() => {
    let cancelled = false;
    getLauncherConfig()
      .then((next) => {
        if (!cancelled && next.instances.length > 0) setConfig(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedId, setSelectedId] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_INSTANCE_KEY) || INSTANCES[0].id;
    } catch {
      return INSTANCES[0].id;
    }
  });
  const selectedInstance = instances.find((i) => i.id === selectedId) ?? instances[0];

  const selectInstance = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(SELECTED_INSTANCE_KEY, id);
    } catch {
      // Storage can be unavailable; the selection still applies for this run.
    }
  }, []);

  const [runtime, dispatch] = useReducer(runtimeReducer, {});
  // Async actions and event handlers read the latest runtime through this ref.
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const patch = useCallback(
    (id: string, p: Partial<InstanceRuntime>) => dispatch({ id, patch: p }),
    [],
  );
  const runtimeOf = useCallback((id: string) => runtime[id] ?? EMPTY_RUNTIME, [runtime]);

  // ---------------------------------------------------------------- account
  const [session, setSession] = useState<Session | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [discordStatus, setDiscordStatus] = useState<DiscordLinkStatus | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const discordRef = useRef(discordStatus);
  discordRef.current = discordStatus;

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((s) => {
        if (!cancelled && s) setSession(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoringSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uuid = session?.profile.uuid ?? null;

  const refreshDiscord = useCallback(async (): Promise<DiscordLinkStatus | null> => {
    const current = sessionRef.current;
    if (!current || !inTauri) return null;
    try {
      const status = await checkDiscordLink(current.profile.uuid);
      // Ignore a response for an account that was signed out while the request was in flight.
      if (sessionRef.current?.profile.uuid !== current.profile.uuid) return null;
      setDiscordStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!uuid) {
      setDiscordStatus(null);
      return;
    }
    refreshDiscord();
  }, [uuid, refreshDiscord]);

  // Poll only while the link is still pending, so completing it in the browser is picked up.
  const discordReady = Boolean(discordStatus?.linked && discordStatus.inGuild);
  useEffect(() => {
    if (!uuid || discordReady) return;
    const timer = setInterval(refreshDiscord, DISCORD_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [uuid, discordReady, refreshDiscord]);

  // -------------------------------------------------------------- instances
  const refreshInstance = useCallback(
    async (inst: Instance) => {
      await Promise.allSettled([
        getSyncState(inst.id).then((state) => patch(inst.id, { state })),
        inTauri && inst.manifestUrl
          ? getManifest(inst.id, inst.manifestUrl).then((manifest) => patch(inst.id, { manifest }))
          : Promise.resolve(),
      ]);
    },
    [patch],
  );

  useEffect(() => {
    instances.forEach((inst) => {
      refreshInstance(inst);
    });
    getRunningInstances()
      .then((ids) => ids.forEach((id) => patch(id, { phase: "running" })))
      .catch(() => {});
  }, [instances, refreshInstance, patch]);

  const [serverStatus, setServerStatus] = useState<Record<string, ServerStatus>>({});
  useEffect(() => {
    if (!inTauri) return;
    const pingAll = () => {
      instances.forEach((inst) => {
        if (!inst.serverAddress) return;
        pingServer(inst.serverAddress)
          .then((status) => setServerStatus((prev) => ({ ...prev, [inst.id]: status })))
          .catch(() => {});
      });
    };
    pingAll();
    const timer = setInterval(pingAll, SERVER_PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [instances]);

  const [accountOpen, setAccountOpen] = useState(false);

  // ----------------------------------------------------------------- events
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

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
        // A late progress event must not resurrect the bar after the sync has settled.
        const phase = runtimeRef.current[p.instanceId]?.phase;
        if (phase === "syncing" || phase === "launching") patch(p.instanceId, { progress: p });
      }),
    );
    register(onPlaytimeUpdated((id, state) => patch(id, { state })));
    register(
      onLaunchStatus((e) => {
        if (e.instanceId) patch(e.instanceId, { statusMessage: e.message });
        else setNotice(e.message);
      }),
    );
    register(
      onGameState((e) => {
        if (e.state === "running") {
          patch(e.instanceId, {
            phase: "running",
            statusMessage: null,
            progress: null,
            error: null,
            crash: null,
            crashSent: false,
          });
          return;
        }
        patch(e.instanceId, { phase: "idle", statusMessage: null, progress: null });
        getSyncState(e.instanceId)
          .then((state) => patch(e.instanceId, { state }))
          .catch(() => {});
        const crashed = !e.stoppedByUser && e.exitCode !== null && e.exitCode !== 0;
        if (crashed) {
          patch(e.instanceId, {
            error: `Minecraft closed unexpectedly (exit code ${e.exitCode}). The game log has the details.`,
          });
          getLatestCrashReport(e.instanceId)
            .then((crash) => {
              // The crash card carries the summary, so it replaces the generic exit message.
              if (crash) patch(e.instanceId, { crash, error: null });
            })
            .catch(() => {});
        }
      }),
    );
    register(onGameLog((batch) => appendLogs(batch.instanceId, batch.lines)));

    return () => {
      disposed = true;
      unlisteners.forEach((u) => u());
    };
  }, [patch]);

  // ---------------------------------------------------------------- actions
  const activeInstanceId = useMemo(() => {
    const entry = Object.entries(runtime).find(([, rt]) => rt.phase !== "idle");
    return entry ? entry[0] : null;
  }, [runtime]);

  const isAnyActive = () =>
    Object.values(runtimeRef.current).some((rt) => rt.phase !== "idle");

  const sync = useCallback(
    async (inst: Instance): Promise<boolean> => {
      if (inst.status !== "playable" || !inst.manifestUrl || isAnyActive()) return false;
      patch(inst.id, { phase: "syncing", error: null, progress: null, statusMessage: null });
      try {
        const state = await syncInstance(inst.id, inst.manifestUrl);
        patch(inst.id, { state });
        getManifest(inst.id, inst.manifestUrl)
          .then((manifest) => patch(inst.id, { manifest }))
          .catch(() => {});
        return true;
      } catch (e) {
        if (String(e) !== SYNC_CANCELLED) patch(inst.id, { error: String(e) });
        return false;
      } finally {
        patch(inst.id, { phase: "idle", progress: null });
      }
    },
    [patch],
  );

  const play = useCallback(
    async (inst: Instance) => {
      if (inst.status !== "playable" || isAnyActive()) return;
      const current = sessionRef.current;
      const blocker = getPlayBlocker(inst, current, discordRef.current);
      if (blocker || !current) {
        patch(inst.id, { error: blocker?.message ?? "Sign in to play." });
        return;
      }
      clearLogs(inst.id);
      patch(inst.id, {
        phase: "launching",
        error: null,
        crash: null,
        crashSent: false,
        progress: null,
        statusMessage: "Checking for modpack updates…",
      });
      try {
        if (inst.manifestUrl) {
          const state = await syncInstance(inst.id, inst.manifestUrl);
          patch(inst.id, { state, progress: null });
          getManifest(inst.id, inst.manifestUrl)
            .then((manifest) => patch(inst.id, { manifest }))
            .catch(() => {});
        }
        patch(inst.id, { statusMessage: "Preparing Java and the game files…" });
        await launchInstance({
          instanceId: inst.id,
          minecraftVersion: inst.minecraftVersion,
          neoforgeVersion: inst.neoforgeVersion ?? "",
          serverAddress: inst.serverAddress,
          session: current,
          instanceName: inst.name,
        });
        // The backend reports "running" through the game-state event once the process exists.
      } catch (e) {
        patch(inst.id, {
          phase: "idle",
          progress: null,
          statusMessage: null,
          error: String(e) === SYNC_CANCELLED ? null : String(e),
        });
      }
    },
    [patch],
  );

  const cancelSync = useCallback((inst: Instance) => {
    invokeCancelSync(inst.id).catch(() => {});
  }, []);

  const stopGame = useCallback(
    (inst: Instance) => {
      invokeStopGame(inst.id).catch((e) => patch(inst.id, { error: String(e) }));
    },
    [patch],
  );

  const dismissError = useCallback((inst: Instance) => patch(inst.id, { error: null }), [patch]);
  const dismissCrash = useCallback((inst: Instance) => patch(inst.id, { crash: null }), [patch]);

  const setInstanceState = useCallback(
    (id: string, state: InstanceState) => patch(id, { state }),
    [patch],
  );

  // --------------------------------------------------------------- settings
  const [settings, setSettings] = useState<LauncherSettings | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  const sendCrashReport = useCallback(
    async (inst: Instance) => {
      const rt = runtimeRef.current[inst.id];
      if (!rt?.crash) return;
      patch(inst.id, { crashSending: true });
      try {
        await submitCrashWebhook({
          webhookUrl: settingsRef.current?.crashWebhookUrl || "",
          playerName: sessionRef.current?.profile.name ?? "Unknown",
          playerUuid: sessionRef.current?.profile.uuid ?? "",
          instanceId: inst.id,
          summary: rt.crash.summary,
          logSnippet: rt.crash.content,
        });
        patch(inst.id, { crashSent: true });
      } catch (e) {
        patch(inst.id, { error: String(e) });
      } finally {
        patch(inst.id, { crashSending: false });
      }
    },
    [patch],
  );

  // ---------------------------------------------------------------- updates
  const [updateInfo, setUpdateInfo] = useState<LauncherUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      setUpdateInfo(await checkLauncherUpdate(APP_VERSION));
    } catch {
      // Offline or rate limited: the next scheduled check will retry.
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkForUpdate]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return;
    setInstallingUpdate(true);
    setUpdateError(null);
    try {
      await installLauncherUpdate(updateInfo.downloadUrl, updateInfo.latestVersion);
    } catch (e) {
      setUpdateError(String(e));
      setInstallingUpdate(false);
    }
  }, [updateInfo]);

  const saveSettings = useCallback(
    async (next: LauncherSettings) => {
      const channelChanged = settingsRef.current?.updateChannel !== next.updateChannel;
      setSettings(next);
      await persistSettings(next);
      if (channelChanged) {
        // The channel decides which launcher release and which modpack manifests apply.
        checkForUpdate();
        instances.forEach((inst) => {
          refreshInstance(inst);
        });
      }
    },
    [checkForUpdate, instances, refreshInstance],
  );

  // ----------------------------------------------------------------- totals
  const { totalPlaytimeSeconds, totalSessions } = useMemo(() => {
    let seconds = 0;
    let sessions = 0;
    for (const rt of Object.values(runtime)) {
      seconds += rt.state.totalPlaytimeSeconds ?? 0;
      sessions += rt.state.sessionsPlayed ?? 0;
    }
    return { totalPlaytimeSeconds: seconds, totalSessions: sessions };
  }, [runtime]);

  const value: LauncherContextValue = {
    instances,
    ticker: config.ticker,
    announcements: config.announcements,
    selectedInstance,
    selectInstance,
    session,
    setSession,
    restoringSession,
    discordStatus,
    refreshDiscord,
    runtimeOf,
    activeInstanceId,
    serverStatus,
    setInstanceState,
    refreshInstance,
    play,
    sync,
    cancelSync,
    stopGame,
    dismissError,
    dismissCrash,
    sendCrashReport,
    accountOpen,
    setAccountOpen,
    notice,
    settings,
    saveSettings,
    updateInfo,
    checkingUpdate,
    installingUpdate,
    updateError,
    checkForUpdate,
    installUpdate,
    totalPlaytimeSeconds,
    totalSessions,
  };

  return <LauncherContext.Provider value={value}>{children}</LauncherContext.Provider>;
}
