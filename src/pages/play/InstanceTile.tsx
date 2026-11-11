import { ReactNode } from "react";
import { CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react";
import { cn } from "../../components/ui";
import { Instance } from "../../instances";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";

/** Compact switcher entry for an instance. Selecting it moves it into the hero. */
export default function InstanceTile({ inst }: { inst: Instance }) {
  const { selectedInstance, selectInstance, runtimeOf, serverStatus } = useLauncher();
  const rt = runtimeOf(inst.id);
  const status = serverStatus[inst.id];
  const { hasUpdate } = getVersionInfo(rt);
  const selected = inst.id === selectedInstance.id;
  const playable = inst.status === "playable";

  let note: ReactNode;
  if (rt.phase === "running") {
    note = (
      <span className="inline-flex items-center gap-1 text-pb-mint">
        <CheckCircle2 size={11} /> Running
      </span>
    );
  } else if (rt.phase !== "idle") {
    note = (
      <span className="inline-flex items-center gap-1 text-pb-cyan">
        <Loader2 size={11} className="animate-spin" /> Working…
      </span>
    );
  } else if (!playable) {
    note = (
      <span className="inline-flex items-center gap-1">
        <Clock size={11} /> {inst.badge ?? "Coming soon"}
      </span>
    );
  } else if (hasUpdate) {
    note = (
      <span className="inline-flex items-center gap-1 text-amber-300">
        <Sparkles size={11} /> Update available
      </span>
    );
  } else if (status?.online) {
    note = (
      <span className="inline-flex items-center gap-1.5 text-pb-mint">
        <span className="h-1.5 w-1.5 rounded-full bg-pb-mint" />
        {status.onlinePlayers} online
      </span>
    );
  } else {
    note = <span>{inst.serverAddress}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => selectInstance(inst.id)}
      className={cn(
        "group relative flex h-24 min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-xl border text-left transition",
        selected
          ? "border-pb-cyan ring-2 ring-pb-cyan/30"
          : "border-white/10 opacity-80 hover:border-white/30 hover:opacity-100",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${inst.bgImage})` }}
      />
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-pb-deep via-pb-deep/70 to-pb-deep/20" />
      <span className="relative flex min-h-0 flex-1 items-center justify-center px-3 pt-2">
        <img
          src={inst.logoImage}
          alt=""
          draggable={false}
          className={cn("max-h-full min-h-0 max-w-full object-contain", !playable && "opacity-70 grayscale-[40%]")}
        />
      </span>
      <span className="relative flex items-center justify-between gap-2 px-3 py-1.5 text-2xs font-semibold text-pb-muted">
        <span className="truncate text-white">{inst.name.replace("PETABLOCKS ", "")}</span>
        <span className="shrink-0">{note}</span>
      </span>
    </button>
  );
}
