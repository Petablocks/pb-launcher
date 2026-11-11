import { CheckCircle2, Clock, FileText, Sparkles, Terminal } from "lucide-react";
import { MinecraftServerIcon } from "../../components/MinecraftServerIcon";
import { Badge, Button, cn } from "../../components/ui";
import { Instance } from "../../instances";
import { formatPlaytime, pluralize } from "../../lib/format";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";
import ServerBadge from "./ServerBadge";
import StatusArea from "./StatusArea";
import { usePlayAction } from "./usePlayAction";

/** The selected instance: artwork, the one primary action, and its live status. */
export default function InstanceHero({
  inst,
  onShowLogs,
  onShowChangelog,
}: {
  inst: Instance;
  onShowLogs: () => void;
  onShowChangelog: () => void;
}) {
  const { runtimeOf, serverStatus } = useLauncher();
  const rt = runtimeOf(inst.id);
  const action = usePlayAction(inst);
  const { hasUpdate, latestVersion, installedVersion } = getVersionInfo(rt);
  const playable = inst.status === "playable";
  const loaderVersion =
    rt.manifest?.neoforge || inst.loaderVersion || inst.neoforgeVersion || inst.loader;

  return (
    <section
      aria-label={inst.name}
      className="relative flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${inst.bgImage})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-pb-deep via-pb-deep/60 to-pb-deep/10" />

      <div className="relative flex shrink-0 items-center justify-between gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="px-3 py-1 font-extrabold uppercase tracking-wider backdrop-blur-md">
            {inst.badge ?? "Instance"}
          </Badge>
          {playable && hasUpdate && (
            <Badge tone="amber" className="backdrop-blur-md">
              <Sparkles size={11} /> Update v{latestVersion}
            </Badge>
          )}
          {playable && !hasUpdate && installedVersion && (
            <Badge tone="mint" className="backdrop-blur-md">
              <CheckCircle2 size={11} /> v{installedVersion} installed
            </Badge>
          )}
        </div>
        <ServerBadge inst={inst} status={serverStatus[inst.id]} />
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-6 py-2">
        <img
          src={inst.logoImage}
          alt={inst.name}
          draggable={false}
          className="max-h-36 min-h-0 w-auto max-w-full object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.9)]"
        />
      </div>

      <div className="relative shrink-0 space-y-3 p-4 pt-2">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <p className="max-w-xl text-sm text-white/85">{inst.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-pb-muted">
              <span className="inline-flex items-center gap-1.5 font-semibold text-white/90">
                <MinecraftServerIcon size={16} />
                Minecraft {rt.manifest?.minecraft || inst.minecraftVersion}
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-white/90">
                <img
                  src={inst.loaderIcon ?? "/cards/neoforge-icon.png"}
                  alt=""
                  className="h-4 w-4 shrink-0 object-contain"
                />
                {loaderVersion}
              </span>
              {playable && (
                <span className="inline-flex items-center gap-1 font-semibold text-pb-cyan">
                  <Clock size={13} />
                  {formatPlaytime(rt.state.totalPlaytimeSeconds)}
                  <span className="font-normal text-pb-muted">
                    · {pluralize(rt.state.sessionsPlayed ?? 0, "session")}
                  </span>
                </span>
              )}
              {playable && (
                <span className="flex items-center">
                  <Button size="sm" variant="ghost" icon={<FileText size={13} />} onClick={onShowChangelog}>
                    What's new
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Terminal size={13} />} onClick={onShowLogs}>
                    Game log
                  </Button>
                </span>
              )}
            </div>
          </div>

          <div className="flex max-w-xs flex-col items-end gap-1.5">
            {playable ? (
              <>
                <Button
                  variant={action.isBlocker ? "secondary" : "primary"}
                  size="xl"
                  icon={action.icon}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  aria-describedby={action.hint ? "play-hint" : undefined}
                  className={cn(
                    !action.isBlocker && "font-minecraft tracking-wider shadow-lg shadow-pb-cyan/20",
                    action.isBlocker && "border-pb-cyan/50 bg-black/60 font-extrabold backdrop-blur-md",
                  )}
                >
                  {action.label}
                </Button>
                {action.hint && (
                  <p id="play-hint" className="text-right text-xs text-white/80">
                    {action.hint}
                  </p>
                )}
              </>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/50 px-5 py-3 text-sm font-bold text-white/80 backdrop-blur-md">
                <Clock size={16} /> {inst.playLabel ?? "Coming soon"}
              </span>
            )}
          </div>
        </div>

        <StatusArea inst={inst} onShowLogs={onShowLogs} onShowChangelog={onShowChangelog} />
      </div>
    </section>
  );
}
