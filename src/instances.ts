import bundledConfig from "../launcher-config.json";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./auth";

export type AccessPolicy = "public" | "discord_linked" | "beta_role" | "patreon_role";

export interface Instance {
  id: string;
  name: string;
  serverAddress: string;
  minecraftVersion: string;
  neoforgeVersion?: string;
  loader: string;
  loaderIcon?: string;
  manifestUrl: string;
  status: "playable" | "coming_soon";
  logoImage: string;
  bgImage: string;
  description: string;
  badge?: string;
  playLabel?: string;
  changelogUrl?: string;
  accessPolicy?: AccessPolicy;
}

export interface Announcement {
  id: string;
  tag: string;
  tone: string;
  date: string;
  title: string;
  summary: string;
  bullets: string[];
}

/**
 * Instance list, footer ticker and announcements. The copy in `launcher-config.json` ships with
 * the launcher; the backend replaces it with the validated remote copy when one is reachable.
 */
export interface LauncherConfig {
  formatVersion: number;
  instances: Instance[];
  ticker: string;
  announcements: Announcement[];
}

export const BUNDLED_CONFIG = bundledConfig as LauncherConfig;

/** Instances compiled into this build (used before the remote config has loaded). */
export const INSTANCES: Instance[] = BUNDLED_CONFIG.instances;

export const getLauncherConfig = (): Promise<LauncherConfig> =>
  inTauri ? invoke<LauncherConfig>("launcher_config_get") : Promise.resolve(BUNDLED_CONFIG);

/** Whether launching this instance requires a linked Discord account with guild membership. */
export function requiresDiscord(inst: Instance): boolean {
  return (inst.accessPolicy ?? "beta_role") !== "public";
}
