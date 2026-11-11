import { ServerStatus } from "../../community";
import { cn } from "../../components/ui";
import { Instance } from "../../instances";

/** Live player count and latency for an instance's server, or its address when unreachable. */
export default function ServerBadge({ inst, status }: { inst: Instance; status?: ServerStatus }) {
  const online = Boolean(status?.online);
  return (
    <span
      title={
        online && status
          ? `${status.motd ? `${status.motd}\n` : ""}${inst.serverAddress}`
          : `${inst.serverAddress} is offline or unreachable`
      }
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold backdrop-blur-md",
        online
          ? "border-pb-mint/30 bg-pb-mint/20 text-pb-mint"
          : "border-white/10 bg-black/60 text-pb-muted",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", online ? "animate-pulse bg-pb-mint" : "bg-neutral-500")} />
      {online && status ? (
        <>
          {status.onlinePlayers} / {status.maxPlayers} online
          {status.latencyMs != null && (
            <span className="font-mono text-2xs opacity-75">· {status.latencyMs}ms</span>
          )}
        </>
      ) : (
        inst.serverAddress
      )}
    </span>
  );
}
