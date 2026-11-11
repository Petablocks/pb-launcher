import { ReactNode } from "react";
import { FileText, Square, Terminal } from "lucide-react";
import { Alert, Button, ProgressBar } from "../../components/ui";
import { Instance } from "../../instances";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";

/**
 * The one place the launcher reports on an instance. Exactly one message is shown, chosen by
 * priority: what it is doing now, then what went wrong, then what is available.
 * Renders nothing when there is nothing to say.
 */
export default function StatusArea({
  inst,
  onShowLogs,
  onShowChangelog,
}: {
  inst: Instance;
  onShowLogs: () => void;
  onShowChangelog: () => void;
}) {
  const {
    runtimeOf,
    activeInstanceId,
    sync,
    cancelSync,
    stopGame,
    dismissError,
    dismissCrash,
    sendCrashReport,
  } = useLauncher();
  const rt = runtimeOf(inst.id);
  const { hasUpdate, latestVersion, installedVersion } = getVersionInfo(rt);

  const logButton: ReactNode = (
    <Button size="sm" icon={<Terminal size={13} />} onClick={onShowLogs}>
      Game log
    </Button>
  );

  if (rt.phase === "syncing" || rt.phase === "launching") {
    const progress = rt.progress;
    const percent =
      progress && progress.total > 0
        ? Math.min(100, (progress.current / progress.total) * 100)
        : null;
    return (
      <div role="status" className="rounded-xl border border-pb-cyan/30 bg-pb-cyan/10 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-semibold text-white">
            {progress?.detail ??
              rt.statusMessage ??
              (rt.phase === "syncing" ? "Preparing update…" : "Starting…")}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {progress && percent !== null && progress.total > 1 && (
              <span className="font-mono text-pb-cyan">
                {progress.current}/{progress.total} · {Math.round(percent)}%
              </span>
            )}
            {progress && (
              <Button size="sm" onClick={() => cancelSync(inst)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2">
          {percent !== null ? (
            <ProgressBar percent={percent} label="Download progress" />
          ) : (
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/40">
              <div className="pb-indeterminate h-full w-1/3 rounded-full bg-pb-cyan" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (rt.phase === "running") {
    return (
      <Alert
        tone="success"
        title={`${inst.name} is running`}
        actions={
          <>
            {logButton}
            <Button size="sm" variant="danger" icon={<Square size={12} />} onClick={() => stopGame(inst)}>
              Stop game
            </Button>
          </>
        }
      >
        Quit from the in-game menu when you can. Stop game force-closes Minecraft.
      </Alert>
    );
  }

  if (rt.crash) {
    return (
      <Alert
        tone="error"
        title="Minecraft crashed"
        onDismiss={() => dismissCrash(inst)}
        actions={
          <>
            {logButton}
            <Button
              size="sm"
              variant="danger"
              loading={rt.crashSending}
              disabled={rt.crashSent}
              onClick={() => sendCrashReport(inst)}
            >
              {rt.crashSent ? "Report sent" : "Send crash report"}
            </Button>
          </>
        }
      >
        {rt.error ?? rt.crash.summary}
      </Alert>
    );
  }

  if (rt.error) {
    return (
      <Alert tone="error" onDismiss={() => dismissError(inst)} actions={logButton}>
        {rt.error}
      </Alert>
    );
  }

  if (hasUpdate) {
    return (
      <Alert
        tone="warning"
        title={`Modpack update available: v${latestVersion}`}
        actions={
          <>
            <Button size="sm" icon={<FileText size={13} />} onClick={onShowChangelog}>
              What's new
            </Button>
            <Button
              size="sm"
              variant="warning"
              disabled={activeInstanceId !== null}
              onClick={() => sync(inst)}
            >
              Update now
            </Button>
          </>
        }
      >
        You have v{installedVersion}. Pressing Play also updates automatically.
      </Alert>
    );
  }

  return null;
}
