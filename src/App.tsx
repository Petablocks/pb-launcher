import { ComponentType, useState } from "react";
import {
  Boxes,
  Bug,
  DownloadCloud,
  ExternalLink,
  Gamepad2,
  Image,
  Newspaper,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import AccountMenu from "./components/AccountMenu";
import { BuyMeACoffeeLogo } from "./components/BrandIcons";
import TitleBar from "./components/TitleBar";
import { Alert, Badge, Button, IconButton, cn } from "./components/ui";
import { openExternal } from "./lib/open";
import Feedback from "./pages/Feedback";
import Mods from "./pages/Mods";
import News, { SUPPORT_URL } from "./pages/News";
import Packs from "./pages/Packs";
import Play from "./pages/Play";
import Screenshots from "./pages/Screenshots";
import Settings from "./pages/Settings";
import { LauncherProvider, useLauncher } from "./state/LauncherProvider";
import { APP_VERSION } from "./version";

type Tab = "play" | "mods" | "packs" | "screenshots" | "news" | "feedback" | "settings";

const NAV: { id: Tab; label: string; icon: typeof Gamepad2 }[] = [
  { id: "play", label: "Play", icon: Gamepad2 },
  { id: "mods", label: "Mods", icon: Boxes },
  { id: "packs", label: "Shaders & Packs", icon: Sparkles },
  { id: "screenshots", label: "Screenshots", icon: Image },
  { id: "news", label: "News", icon: Newspaper },
  { id: "feedback", label: "Feedback", icon: Bug },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const PAGES: Record<Tab, ComponentType> = {
  play: Play,
  mods: Mods,
  packs: Packs,
  screenshots: Screenshots,
  news: News,
  feedback: Feedback,
  settings: Settings,
};

function Shell() {
  const [tab, setTab] = useState<Tab>("play");
  const {
    updateInfo,
    checkingUpdate,
    installingUpdate,
    updateError,
    checkForUpdate,
    installUpdate,
    settings,
    notice,
  } = useLauncher();
  const Page = PAGES[tab];

  return (
    <div className="flex h-full flex-col bg-pb-bg">
      <TitleBar />

      {updateInfo?.updateAvailable && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-pb-cyan/30 bg-pb-cyan/15 px-4 py-2 text-xs"
        >
          <span className="flex min-w-0 items-center gap-2 font-semibold text-white">
            <DownloadCloud size={15} className="shrink-0 text-pb-cyan" />
            <span className="truncate">
              {updateError ?? `Launcher v${updateInfo.latestVersion} is ready to install.`}
            </span>
          </span>
          <Button size="sm" variant="primary" loading={installingUpdate} onClick={installUpdate}>
            {installingUpdate ? "Installing…" : "Update and restart"}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-pb-card p-3">
          <div className="flex-1 space-y-1">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                  tab === id ? "bg-pb-cyan/15 text-pb-cyan" : "text-pb-muted hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className="mb-3">
            <AccountMenu />
          </div>

          <button
            type="button"
            onClick={() => openExternal(SUPPORT_URL)}
            className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-pb-muted transition hover:bg-white/5 hover:text-white"
          >
            <BuyMeACoffeeLogo size={14} className="shrink-0 text-bmc" />
            <span className="flex-1 text-left">Support the servers</span>
            <ExternalLink size={12} />
          </button>

          <div className="flex items-center justify-between px-3 pb-1 text-xs text-pb-muted">
            <span className="flex items-center gap-1.5">
              v{APP_VERSION}
              {settings?.updateChannel === "staging" && <Badge tone="amber">Staging</Badge>}
            </span>
            <IconButton label="Check for launcher updates" disabled={checkingUpdate} onClick={checkForUpdate}>
              <RefreshCw size={12} className={checkingUpdate ? "animate-spin text-pb-cyan" : ""} />
            </IconButton>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 overflow-y-auto p-6">
            {notice && (
              <Alert tone="warning" className="mb-4">
                {notice}
              </Alert>
            )}
            <Page />
          </main>

          <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-pb-deep px-6 text-xs text-pb-muted">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex shrink-0 items-center gap-1.5 font-bold text-white">
                <Newspaper size={13} className="text-pb-cyan" />
                What's new
              </span>
              <span className="truncate text-white/80">
                PETABLOCKS Season 2 (Minecraft 1.21.1 / NeoForge 21.1.259) is live on s2.petablocks.com!
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTab("news")}
              className="shrink-0 font-medium transition hover:text-pb-cyan"
            >
              All announcements →
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LauncherProvider>
      <Shell />
    </LauncherProvider>
  );
}
