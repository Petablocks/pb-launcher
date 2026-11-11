import { CheckCircle2, Clock, Sparkles } from "lucide-react";
import { MinecraftServerIcon } from "../../components/MinecraftServerIcon";
import { Badge, Button, cn } from "../../components/ui";
import { Instance } from "../../instances";
import { formatPlaytime, pluralize } from "../../lib/format";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";
import ServerBadge from "./ServerBadge";
import { usePlayAction } from "./usePlayAction";

export default function InstanceCard({ inst }: { inst: Instance }) {
  const { selectedInstance, selectInstance, runtimeOf, serverStatus } = useLauncher();
  const rt = runtimeOf(inst.id);
  const action = usePlayAction(inst);
  const { hasUpdate, latestVersion, installedVersion } = getVersionInfo(rt);
  const selected = inst.id === selectedInstance.id;
  const playable = inst.status === "playable";
  const loaderVersion = rt.manifest?.neoforge || inst.loaderVersion || inst.neoforgeVersion || inst.loader;

  return (
    <article
      className={cn(
        "group relative flex min-h-0 flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-300",
        selected
          ? "border-pb-cyan/80 ring-2 ring-pb-cyan/30"
          : "border-white/10 hover:border-white/30",
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url(${inst.bgImage})` }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-pb-deep via-pb-deep/50 to-transparent" />

      {/* The whole card selects the instance; real controls sit above this button. */}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${inst.name}`}
        onClick={() => selectInstance(inst.id)}
        className="absolute inset-0 z-0 rounded-2xl"
      />

      <div className="pointer-events-none relative z-10 flex shrink-0 items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
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
              <CheckCircle2 size={11} /> v{installedVersion}
            </Badge>
          )}
        </div>
        <ServerBadge inst={inst} status={serverStatus[inst.id]} />
      </div>

      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 py-2">
        <img
          src={inst.logoImage}
          alt={inst.name}
          draggable={false}
          className="max-h-full min-h-0 w-auto max-w-full object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.9)]"
        />
      </div>

      <div className="pointer-events-none relative z-10 shrink-0 border-t border-white/10 bg-black/50 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-pb-muted">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white/90">
              <MinecraftServerIcon size={16} />
              {rt.manifest?.minecraft || inst.minecraftVersion}
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
                  ({pluralize(rt.state.sessionsPlayed ?? 0, "session")})
                </span>
              </span>
            )}
          </div>

          {playable ? (
            <Button
              variant={action.isBlocker ? "secondary" : "primary"}
              size="lg"
              icon={action.icon}
              disabled={action.disabled}
              title={action.hint ?? undefined}
              onClick={() => {
                selectInstance(inst.id);
                action.onClick();
              }}
              className={cn("pointer-events-auto", !action.isBlocker && "font-minecraft tracking-wider")}
            >
              {action.label}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-pb-muted">
              <Clock size={14} /> {inst.playLabel ?? "Coming soon"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
