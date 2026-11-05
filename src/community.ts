import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./auth";

export interface PlayerSample {
  name: string;
  id: string;
}

export interface ServerStatus {
  online: boolean;
  latencyMs: number | null;
  onlinePlayers: number;
  maxPlayers: number;
  playerSample?: PlayerSample[];
  versionName: string | null;
  motd: string | null;
}

export interface ScreenshotItem {
  filename: string;
  path: string;
  size: number;
  modifiedEpoch: number;
  dataUrl: string;
}

export interface CrashReportInfo {
  filename: string;
  path: string;
  summary: string;
  content: string;
}

export const pingServer = (address: string): Promise<ServerStatus> =>
  inTauri
    ? invoke<ServerStatus>("server_ping", { address })
    : Promise.resolve({
        online: false,
        latencyMs: null,
        onlinePlayers: 0,
        maxPlayers: 0,
        versionName: null,
        motd: null,
      });

export const listScreenshots = (instanceId: string): Promise<ScreenshotItem[]> =>
  inTauri ? invoke<ScreenshotItem[]>("screenshots_list", { instanceId }) : Promise.resolve([]);

export const getScreenshotsDir = (instanceId: string): Promise<string> =>
  invoke<string>("screenshots_dir", { instanceId });

export const getLatestCrashReport = (instanceId: string): Promise<CrashReportInfo | null> =>
  inTauri ? invoke<CrashReportInfo | null>("crash_latest", { instanceId }) : Promise.resolve(null);

export const submitCrashWebhook = (args: {
  webhookUrl: string;
  playerName: string;
  instanceId: string;
  summary: string;
  logSnippet: string;
}): Promise<void> => invoke<void>("crash_submit_webhook", args);

export const submitBetaFeedback = (args: {
  webhookUrl: string;
  category: string;
  title: string;
  description: string;
  playerName: string;
  contact: string;
  launcherVersion: string;
  includeDiagnostics: boolean;
  instanceId: string;
}): Promise<void> => invoke<void>("feedback_submit", args);

export interface LauncherUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  downloadUrl: string | null;
  releaseUrl: string;
  notes: string;
}

export const checkLauncherUpdate = (currentVersion: string): Promise<LauncherUpdateInfo> =>
  inTauri
    ? invoke<LauncherUpdateInfo>("updater_check", { currentVersion })
    : Promise.resolve({
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        downloadUrl: null,
        releaseUrl: "https://github.com/Petablocks/pb-launcher/releases",
        notes: "",
      });

export const installLauncherUpdate = (downloadUrl: string, version: string): Promise<void> =>
  invoke<void>("updater_install", { downloadUrl, version });

export const finishSplash = (): Promise<void> =>
  inTauri ? invoke<void>("splash_complete") : Promise.resolve();

export interface DiscordLinkStatus {
  linked: boolean;
  discordId: string | null;
  discordUsername: string | null;
  rank: string;
  inGuild: boolean;
  betaEligible: boolean;
  pendingCode: string | null;
}

export interface LauncherLinkCodeResponse {
  ok: boolean;
  code: string;
  oauthUrl: string;
  expiresInMinutes: number;
}

export const checkDiscordLink = (uuid: string): Promise<DiscordLinkStatus> =>
  inTauri
    ? invoke<DiscordLinkStatus>("discord_check_link", { uuid })
    : Promise.resolve({
        linked: false,
        discordId: null,
        discordUsername: null,
        rank: "Player",
        inGuild: false,
        betaEligible: false,
        pendingCode: null,
      });

export const requestDiscordLinkCode = (
  uuid: string,
  username: string
): Promise<LauncherLinkCodeResponse> =>
  invoke<LauncherLinkCodeResponse>("discord_request_link_code", { uuid, username });
