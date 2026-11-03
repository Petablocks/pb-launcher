import { useEffect, useState } from "react";
import { CheckCircle2, DownloadCloud, Loader2, Play } from "lucide-react";
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

  useEffect(() => {
    getSyncState(instance.id).then(setSyncState).catch(() => {});
    if (inTauri) {
      getManifest(instance.id, instance.manifestUrl)
        .then(setManifest)
        .catch(() => {});
    }
    let unlisten: (() => void) | undefined;
    onSyncProgress((p) => {
      if (p.instanceId === instance.id) setProgress(p);
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [instance.id, instance.manifestUrl]);

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

  const latestVersion = manifest?.version ?? null;
  const isUpToDate =
    Boolean(syncState.installedVersion) &&
    (!latestVersion || syncState.installedVersion === latestVersion);
  const verifiedOnlineSession = Boolean(session && !session.offline && session.access_token);

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-pb-mint/15 px-3 py-1 text-xs font-bold text-pb-mint">
              <span className="h-2 w-2 rounded-full bg-pb-mint" /> {instance.serverAddress}
            </div>
            {latestVersion && (
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-pb-muted">
                Modpack v{latestVersion} ({manifest?.mods.length ?? 0} client mods)
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-extrabold">{instance.name}</h1>
          <p className="mt-1 text-sm text-pb-muted">
            Minecraft {instance.minecraftVersion} - {instance.loader}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing || !inTauri}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-pb-cyan/40 bg-pb-cyan/15 px-5 py-3 text-sm font-extrabold text-pb-cyan transition hover:bg-pb-cyan/25 disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Syncing Modpack...
                </>
              ) : isUpToDate ? (
                <>
                  <CheckCircle2 size={18} className="text-pb-mint" /> Verify / Sync (v{syncState.installedVersion})
                </>
              ) : (
                <>
                  <DownloadCloud size={18} />{" "}
                  {syncState.installedVersion
                    ? `Update to v${latestVersion ?? "latest"}`
                    : "Install / Sync Modpack"}
                </>
              )}
            </button>

            <button
              disabled={!verifiedOnlineSession || !isUpToDate || syncing}
              className="pb-glow inline-flex items-center gap-2 rounded-xl bg-pb-cyan px-8 py-3 text-lg font-extrabold text-[#031617] disabled:opacity-50"
            >
              <Play size={20} fill="currentColor" /> Play
            </button>
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

          {syncError && <p className="mt-3 text-xs text-red-400">{syncError}</p>}

          <p className="mt-3 text-xs text-pb-muted">
            {!verifiedOnlineSession
              ? "Sign in with a verified Microsoft account owning Minecraft: Java Edition to enable Play."
              : !isUpToDate
              ? "Sync the Season 2 modpack first, then launch (Phase 4 launch engine next)."
              : "Modpack verified & ready. Game launch engine arrives in Phase 4."}
          </p>
        </div>
      </section>

      <AccountCard session={session} onSession={onSession} />
    </div>
  );
}
