import { Session } from "../auth";
import { DiscordLinkStatus } from "../community";
import { Instance, requiresDiscord } from "../instances";

export type PlayBlockerKind = "sign-in" | "re-verify" | "link-discord" | "join-discord";

export interface PlayBlocker {
  kind: PlayBlockerKind;
  /** Why Play is unavailable, in the player's terms. */
  message: string;
  /** Label for the action that resolves it. */
  action: string;
}

/**
 * The single account-related reason an instance cannot be launched right now, or null when the
 * player is cleared to play. Mirrors the checks the launch backend enforces.
 */
export function getPlayBlocker(
  inst: Instance,
  session: Session | null,
  discord: DiscordLinkStatus | null,
): PlayBlocker | null {
  if (!session) {
    return {
      kind: "sign-in",
      message: "Sign in with the Microsoft account that owns Minecraft: Java Edition.",
      action: "Sign in",
    };
  }
  if (session.offline || !session.access_token) {
    return {
      kind: "re-verify",
      message: "Your Minecraft session could not be verified. Sign in again to play online.",
      action: "Sign in again",
    };
  }
  if (requiresDiscord(inst)) {
    if (!discord?.linked) {
      return {
        kind: "link-discord",
        message: `${inst.name} is in closed beta. Link your Discord account to unlock it.`,
        action: "Link Discord",
      };
    }
    if (!discord.inGuild) {
      return {
        kind: "join-discord",
        message: "Join the PETABLOCKS Discord server to unlock this instance.",
        action: "Join Discord",
      };
    }
  }
  return null;
}
