import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./auth";

export interface ServerStatus {
  online: boolean;
  latencyMs: number | null;
  onlinePlayers: number;
  maxPlayers: number;
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
