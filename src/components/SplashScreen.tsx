import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { INSTANCES } from "../instances";
import { inTauri, restoreSession } from "../auth";
import { checkLauncherUpdate, finishSplash, installLauncherUpdate, pingServer } from "../community";
import { detectJava } from "../launch";
import { getManifest } from "../sync";
import { APP_VERSION } from "../version";
import stackedLogo from "../assets/petablocks-logo-stacked-512w.png";

export default function SplashScreen() {
  const [status, setStatus] = useState("Initializing PETABLOCKS Launcher...");
  const [progress, setProgress] = useState(12);
  const [updatingTo, setUpdatingTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const instance = INSTANCES[0];

    async function runBootSequence() {
      try {
        // Step 1: Check for Launcher Updates & auto-install if available
        setStatus("Checking for launcher updates...");
        setProgress(22);
        if (inTauri) {
          try {
            const update = await checkLauncherUpdate(APP_VERSION);
            if (update.updateAvailable && update.downloadUrl) {
              if (!cancelled) {
                setUpdatingTo(update.latestVersion);
                setStatus(`Installing update v${update.latestVersion} & restarting...`);
                setProgress(65);
              }
              await installLauncherUpdate(update.downloadUrl, update.latestVersion);
              return; // App will exit & relaunch into the new version automatically
            }
          } catch {
            // Continue boot if offline or GitHub API unreachable
          }
        }

        // Step 2: Restore cached Microsoft session
        if (!cancelled) {
          setStatus("Verifying Microsoft account session...");
          setProgress(48);
        }
        await restoreSession().catch(() => null);

        // Step 3: Check Modpack Manifest & Java 21 runtime in parallel
        if (!cancelled) {
          setStatus("Syncing Season 2 manifest & Java 21 runtime...");
          setProgress(74);
        }
        if (inTauri) {
          await Promise.allSettled([
            getManifest(instance.id, instance.manifestUrl),
            detectJava(),
            pingServer(instance.serverAddress),
          ]);
        }

        // Step 4: Ready! Reveal main window and close splash
        if (!cancelled) {
          setStatus("Ready to launch!");
          setProgress(100);
        }
        await new Promise((r) => setTimeout(r, 380));
        if (!cancelled) {
          await finishSplash();
        }
      } catch {
        if (!cancelled) {
          await finishSplash();
        }
      }
    }

    runBootSequence();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-full w-full flex-col items-center justify-center bg-transparent p-6 select-none"
    >
      {/* Floating frameless emblem with soft ambient glow */}
      <div
        data-tauri-drag-region
        className="relative flex flex-col items-center justify-center"
      >
        <div className="pointer-events-none absolute -inset-8 rounded-full bg-pb-cyan/20 blur-3xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-6 h-24 w-48 rounded-full bg-pb-purple/25 blur-2xl" />

        <img
          src={stackedLogo}
          alt="PETABLOCKS"
          draggable={false}
          className="relative z-10 h-36 w-auto object-contain drop-shadow-[0_12px_28px_rgba(15,205,248,0.45)] transition-transform duration-500"
        />

        <div className="relative z-10 mt-2 flex items-center gap-2">
          <span className="font-minecraft text-base tracking-[0.22em] pb-text-gradient-purple drop-shadow-[0_2px_10px_rgba(168,36,255,0.6)]">
            LAUNCHER
          </span>
          <span className="rounded-md border border-pb-purple/50 bg-[#0B0F19]/90 px-1.5 py-0.5 text-[10px] font-extrabold tracking-widest text-pb-purple shadow-lg">
            BETA v{APP_VERSION}
          </span>
        </div>
      </div>

      {/* Floating glass status pill & progress bar */}
      <div className="relative z-10 mt-6 w-80 overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F19]/90 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 truncate font-semibold text-white">
            {updatingTo ? (
              <Sparkles size={13} className="shrink-0 text-pb-mint animate-spin" />
            ) : (
              <Loader2 size={13} className="shrink-0 text-pb-cyan animate-spin" />
            )}
            <span className="truncate">{status}</span>
          </span>
          <span className="font-mono text-[11px] font-bold text-pb-cyan">{progress}%</span>
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #0FCDF8 0%, #8BFAA3 50%, #A824FF 100%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
