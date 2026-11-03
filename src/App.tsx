import { useState } from "react";
import { Gamepad2, Boxes, Image, Settings as SettingsIcon, Newspaper } from "lucide-react";
import TitleBar from "./components/TitleBar";
import Home from "./pages/Home";
import Placeholder from "./pages/Placeholder";
import { Session } from "./auth";
import { APP_VERSION } from "./version";

type Tab = "play" | "mods" | "screenshots" | "news" | "settings";

const NAV: { id: Tab; label: string; icon: typeof Gamepad2 }[] = [
  { id: "play", label: "Play", icon: Gamepad2 },
  { id: "mods", label: "Mods", icon: Boxes },
  { id: "screenshots", label: "Screenshots", icon: Image },
  { id: "news", label: "News", icon: Newspaper },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("play");
  const [session, setSession] = useState<Session | null>(null);

  return (
    <div className="flex h-full flex-col bg-pb-bg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-56 flex-col border-r border-white/10 bg-pb-card p-3">
          <div className="flex-1 space-y-1">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-pb-cyan/15 text-pb-cyan"
                      : "text-pb-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="px-3 pb-1 text-xs text-pb-muted">Launcher v{APP_VERSION}</div>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          {tab === "play" ? <Home session={session} onSession={setSession} /> : <Placeholder title={NAV.find((n) => n.id === tab)!.label} />}
        </main>
      </div>
    </div>
  );
}

