import { useEffect, useState } from "react";
import {
  Gamepad2,
  Boxes,
  Sparkles,
  Image,
  Settings as SettingsIcon,
  Newspaper,
  Bug,
  DownloadCloud,
  RefreshCw,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import TitleBar from "./components/TitleBar";
import Home from "./pages/Home";
import Mods from "./pages/Mods";
import Packs from "./pages/Packs";
import Screenshots from "./pages/Screenshots";
import News from "./pages/News";
import Feedback from "./pages/Feedback";
import Settings from "./pages/Settings";
import { Session, inTauri } from "./auth";
import { LauncherUpdateInfo, checkLauncherUpdate, installLauncherUpdate } from "./community";
import { BuyMeACoffeeLogo } from "./components/BrandIcons";
import { APP_VERSION } from "./version";
import SidebarAccountPill from "./components/SidebarAccountPill";
import { DiscordLinkStatus } from "./community";
import { INSTANCES } from "./instances";
import { getSyncState, onPlaytimeUpdated } from "./sync";

type Tab = "play" | "mods" | "packs" | "screenshots" | "news" | "feedback" | "settings";

const NAV: { id: Tab; label: string; icon: typeof Gamepad2; badge?: string }[] = [
  { id: "play", label: "Play", icon: Gamepad2 },
  { id: "mods", label: "Mods", icon: Boxes },
  { id: "packs", label: "Shaders & Packs", icon: Sparkles },
  { id: "screenshots", label: "Screenshots", icon: Image },
  { id: "news", label: "News", icon: Newspaper },
  { id: "feedback", label: "Feedback", icon: Bug },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("play");
  const [session, setSession] = useState<Session | null>(null);
  const [discordStatus, setDiscordStatus] = useState<DiscordLinkStatus | null>(null);
  const [updateInfo, setUpdateInfo] = useState<LauncherUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [playtimeByInstance, setPlaytimeByInstance] = useState<
    Record<string, { seconds: number; sessions: number }>
  >({});

  async function refreshAllPlaytime() {
    if (!inTauri) return;
    const entries: Record<string, { seconds: number; sessions: number }> = {};
    for (const inst of INSTANCES) {
      try {
        const st = await getSyncState(inst.id);
        entries[inst.id] = {
          seconds: st.totalPlaytimeSeconds ?? 0,
          sessions: st.sessionsPlayed ?? 0,
        };
      } catch {
        // ignore
      }
    }
    setPlaytimeByInstance(entries);
  }

  async function runUpdateCheck() {
    setCheckingUpdate(true);
    try {
      const info = await checkLauncherUpdate(APP_VERSION);
      setUpdateInfo(info);
    } catch {
      // Ignore network errors during background update check
    } finally {
      setCheckingUpdate(false);
    }
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    runUpdateCheck();
    refreshAllPlaytime();
    onPlaytimeUpdated((instId, st) => {
      if (disposed) return;
      setPlaytimeByInstance((prev) => ({
        ...prev,
        [instId]: {
          seconds: st.totalPlaytimeSeconds ?? 0,
          sessions: st.sessionsPlayed ?? 0,
        },
      }));
    }).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    const timer = setInterval(runUpdateCheck, 120000);
    return () => {
      disposed = true;
      clearInterval(timer);
      unlisten?.();
    };
  }, []);

  const totalPlaytimeSeconds = Object.values(playtimeByInstance).reduce(
    (sum, v) => sum + v.seconds,
    0
  );
  const totalSessionsPlayed = Object.values(playtimeByInstance).reduce(
    (sum, v) => sum + v.sessions,
    0
  );

  async function handleInstallUpdate() {
    if (!updateInfo?.downloadUrl) return;
    setInstallingUpdate(true);
    try {
      await installLauncherUpdate(updateInfo.downloadUrl, updateInfo.latestVersion);
    } catch {
      setInstallingUpdate(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-pb-bg">
      <TitleBar />

      {updateInfo?.updateAvailable && (
        <div className="flex items-center justify-between border-b border-pb-cyan/30 bg-pb-cyan/15 px-4 py-2 text-xs">
          <div className="flex items-center gap-2 font-semibold text-white">
            <DownloadCloud size={15} className="text-pb-cyan" />
            <span>
              A new PETABLOCKS Launcher update (<strong>v{updateInfo.latestVersion}</strong>) is ready!
            </span>
          </div>
          <button
            onClick={handleInstallUpdate}
            disabled={installingUpdate}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-pb-cyan px-3 py-1 font-extrabold text-[#031617] hover:brightness-110 disabled:opacity-50"
          >
            {installingUpdate ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Installing & Restarting...
              </>
            ) : (
              "Update & Restart Now"
            )}
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-pb-card p-3">
          <div className="flex-1 space-y-1">
            {NAV.map(({ id, label, icon: Icon, badge }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-pb-cyan/15 text-pb-cyan"
                      : "text-pb-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3 truncate">
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                  {badge && (
                    <span className="shrink-0 rounded bg-pb-purple/20 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-pb-purple">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Account Pill at bottom of sidebar */}
          <div className="mb-3">
            <SidebarAccountPill
              session={session}
              onSession={setSession}
              discordStatus={discordStatus}
              onDiscordStatus={setDiscordStatus}
              totalPlaytimeSeconds={totalPlaytimeSeconds}
              sessionsPlayed={totalSessionsPlayed}
            />
          </div>

          {/* Optional Community Support (Buy Me a Coffee) */}
          <div className="mb-3 rounded-xl border border-[#FFDD00]/20 bg-[#FFDD00]/5 p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-0.5 text-[10px] font-bold text-pb-muted">
              <span>Optional Hosting Support</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const url = "https://buymeacoffee.com/petabyteofficial";
                if (inTauri) openUrl(url).catch(() => {});
                else window.open(url, "_blank");
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-[#FFDD00] px-2.5 py-1.5 text-xs font-extrabold text-black transition hover:bg-[#ffe338]"
            >
              <span className="flex items-center gap-2">
                <BuyMeACoffeeLogo size={14} />
                Buy Me a Coffee
              </span>
              <ExternalLink size={12} />
            </button>
          </div>

          <div className="flex items-center justify-between px-3 pb-1 text-xs text-pb-muted">
            <span>Launcher v{APP_VERSION}</span>
            <button
              onClick={runUpdateCheck}
              disabled={checkingUpdate}
              title="Check for launcher updates"
              className="rounded p-1 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw size={12} className={checkingUpdate ? "animate-spin text-pb-cyan" : ""} />
            </button>
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 overflow-y-auto p-6">
            {tab === "play" ? (
              <Home
                session={session}
                onSession={setSession}
                discordStatus={discordStatus}
                onDiscordStatus={setDiscordStatus}
              />
            ) : tab === "mods" ? (
              <Mods />
            ) : tab === "packs" ? (
              <Packs />
            ) : tab === "screenshots" ? (
              <Screenshots />
            ) : tab === "news" ? (
              <News />
            ) : tab === "feedback" ? (
              <Feedback session={session} />
            ) : (
              <Settings />
            )}
          </main>

          {/* Bottom Ticker Bar (HaulMP style) */}
          <footer className="flex h-10 items-center justify-between border-t border-white/10 bg-[#060a12] px-6 text-xs text-pb-muted">
            <div className="flex items-center gap-3 overflow-hidden">
              <span className="flex items-center gap-1.5 font-bold text-white">
                <Newspaper size={13} className="text-pb-cyan" />
                What's new:
              </span>
              <span className="rounded bg-pb-cyan/20 px-1.5 py-0.5 text-[10px] font-extrabold text-pb-cyan">
                SEASON 2
              </span>
              <span className="truncate text-white/80">
                PETABLOCKS Season 2 (Minecraft 1.21.1 / NeoForge 21.1.259) is live on s2.petablocks.com!
              </span>
            </div>
            <div className="flex items-center gap-4 shrink-0 font-medium">
              <button
                onClick={() => setTab("news")}
                className="hover:text-pb-cyan transition cursor-pointer"
              >
                All Announcements →
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
