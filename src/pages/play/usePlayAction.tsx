import { ReactNode } from "react";
import { CheckCircle2, DownloadCloud, Loader2, LogIn, Play, RefreshCw } from "lucide-react";
import { DISCORD_INVITE_URL } from "../../components/AccountMenu";
import { DiscordLogo } from "../../components/BrandIcons";
import { Instance } from "../../instances";
import { openExternal } from "../../lib/open";
import { getPlayBlocker } from "../../state/access";
import { getVersionInfo, useLauncher } from "../../state/LauncherProvider";

export interface PlayAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  /** Shown under or beside the button when it needs explaining. */
  hint: string | null;
  /** True when the button resolves an account requirement instead of launching. */
  isBlocker: boolean;
}

/**
 * Resolves what the main button for an instance should say and do right now. Account
 * requirements become the action that fixes them rather than a disabled Play button.
 */
export function usePlayAction(inst: Instance): PlayAction {
  const {
    session,
    restoringSession,
    discordStatus,
    runtimeOf,
    activeInstanceId,
    instances,
    play,
    setAccountOpen,
    refreshDiscord,
  } = useLauncher();
  const rt = runtimeOf(inst.id);
  const { hasUpdate, needsInstall } = getVersionInfo(rt);
  const iconSize = 16;

  if (rt.phase === "running") {
    return {
      label: "Running",
      icon: <CheckCircle2 size={iconSize} />,
      onClick: () => {},
      disabled: true,
      hint: null,
      isBlocker: false,
    };
  }
  if (rt.phase === "launching") {
    return {
      label: "Launching",
      icon: <Loader2 size={iconSize} className="animate-spin" />,
      onClick: () => {},
      disabled: true,
      hint: null,
      isBlocker: false,
    };
  }
  if (rt.phase === "syncing") {
    return {
      label: "Updating",
      icon: <RefreshCw size={iconSize} className="animate-spin" />,
      onClick: () => {},
      disabled: true,
      hint: null,
      isBlocker: false,
    };
  }

  if (restoringSession) {
    return {
      label: "Checking account",
      icon: <Loader2 size={iconSize} className="animate-spin" />,
      onClick: () => {},
      disabled: true,
      hint: null,
      isBlocker: false,
    };
  }

  const blocker = getPlayBlocker(inst, session, discordStatus);
  if (blocker) {
    const joinDiscord = blocker.kind === "join-discord";
    const discordStep = joinDiscord || blocker.kind === "link-discord";
    return {
      label: blocker.action,
      icon: discordStep ? <DiscordLogo size={iconSize} /> : <LogIn size={iconSize} />,
      onClick: () => {
        if (joinDiscord) {
          openExternal(DISCORD_INVITE_URL);
          refreshDiscord();
        } else {
          setAccountOpen(true);
        }
      },
      disabled: false,
      hint: blocker.message,
      isBlocker: true,
    };
  }

  if (activeInstanceId && activeInstanceId !== inst.id) {
    const other = instances.find((i) => i.id === activeInstanceId);
    return {
      label: inst.playLabel ?? "Play",
      icon: <Play size={iconSize} fill="currentColor" />,
      onClick: () => {},
      disabled: true,
      hint: `${other?.name ?? "Another instance"} is busy. Only one instance runs at a time.`,
      isBlocker: false,
    };
  }

  return {
    label: hasUpdate ? "Update & Play" : needsInstall ? "Install & Play" : (inst.playLabel ?? "Play"),
    icon:
      hasUpdate || needsInstall ? (
        <DownloadCloud size={iconSize} />
      ) : (
        <Play size={iconSize} fill="currentColor" />
      ),
    onClick: () => {
      play(inst);
    },
    disabled: false,
    hint: null,
    isBlocker: false,
  };
}
