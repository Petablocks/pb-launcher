import { ReactNode } from "react";
import { Check } from "lucide-react";
import { DISCORD_INVITE_URL } from "../../components/AccountMenu";
import { Button, cn } from "../../components/ui";
import { requiresDiscord } from "../../instances";
import { openExternal } from "../../lib/open";
import { useLauncher } from "../../state/LauncherProvider";

interface Step {
  title: string;
  detail: string;
  done: boolean;
  action?: ReactNode;
}

/**
 * First-run guide: the steps between a fresh install and the first launch. It disappears for
 * good once the player has an account that can play and at least one installed instance.
 */
export default function SetupChecklist() {
  const {
    instances,
    session,
    restoringSession,
    discordStatus,
    runtimeOf,
    setAccountOpen,
    refreshDiscord,
  } = useLauncher();

  if (restoringSession) return null;

  const playable = instances.filter((i) => i.status === "playable");
  const signedIn = Boolean(session && !session.offline);
  const discordNeeded = playable.some(requiresDiscord);
  const discordReady = Boolean(discordStatus?.linked && discordStatus.inGuild);
  const installed = playable.some((i) => runtimeOf(i.id).state.installedVersion);
  const gatedNames = playable
    .filter(requiresDiscord)
    .map((i) => i.name.replace("PETABLOCKS ", ""))
    .join(", ");

  const accountReady = signedIn && (!discordNeeded || discordReady);
  if (accountReady && installed) return null;

  const steps: Step[] = [
    {
      title: "Sign in with Microsoft",
      detail: "Use the account that owns Minecraft: Java Edition.",
      done: signedIn,
      action: (
        <Button size="sm" variant="primary" onClick={() => setAccountOpen(true)}>
          Sign in
        </Button>
      ),
    },
  ];
  if (discordNeeded) {
    const linked = Boolean(discordStatus?.linked);
    steps.push({
      title: linked ? "Join the Discord server" : "Link Discord",
      detail: `Needed for closed beta servers (${gatedNames}).`,
      done: discordReady,
      action: (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            if (linked) {
              openExternal(DISCORD_INVITE_URL);
              refreshDiscord();
            } else {
              setAccountOpen(true);
            }
          }}
        >
          {linked ? "Join" : "Link"}
        </Button>
      ),
    });
  }
  steps.push({
    title: "Install and play",
    detail: "Pick a server below and press Play. The launcher downloads everything.",
    done: installed,
  });

  const current = steps.findIndex((s) => !s.done);

  return (
    <section aria-label="Getting started" className="rounded-2xl border border-pb-purple/30 bg-pb-purple/10 p-3">
      <ol className="flex flex-wrap gap-3">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex min-w-52 flex-1 items-center gap-3 rounded-xl border px-3 py-2",
                isCurrent ? "border-pb-cyan/40 bg-black/40" : "border-transparent",
                !isCurrent && !step.done && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                  step.done ? "bg-pb-mint text-pb-ink" : isCurrent ? "bg-pb-cyan text-pb-ink" : "bg-white/15 text-white",
                )}
              >
                {step.done ? <Check size={14} aria-label="Done" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-white">{step.title}</span>
                <span className="block text-2xs text-pb-muted">{step.detail}</span>
              </span>
              {isCurrent && step.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
