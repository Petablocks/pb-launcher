import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Session, inTauri } from "./auth";

export interface LauncherSettings {
  memoryMb: number;
  customJavaPath: string | null;
  extraJvmArgs: string;
  tuningPreset?: "eco" | "standard" | "enthusiast" | "custom";
  closeOnLaunch: boolean;
  directConnect: boolean;
  crashWebhookUrl?: string | null;
  updateChannel?: "stable" | "staging";
}

export interface JavaStatus {
  found: boolean;
  path: string | null;
  version: string | null;
  source: "custom" | "managed" | "system" | "missing";
}

export interface LaunchRequest {
  instanceId: string;
  minecraftVersion: string;
  neoforgeVersion: string;
  serverAddress: string;
  session: Session;
  instanceName?: string;
}

export interface GameLogLine {
  line: string;
  isError: boolean;
}

const DEFAULT_SETTINGS: LauncherSettings = {
  memoryMb: 8192,
  customJavaPath: null,
  tuningPreset: "standard",
  extraJvmArgs:
    "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
  closeOnLaunch: true,
  directConnect: true,
  crashWebhookUrl: null,
  updateChannel: "stable",
};

export const getSystemMemoryMb = (): Promise<number> =>
  inTauri ? invoke<number>("system_memory_mb") : Promise.resolve(0);

export const getSettings = (): Promise<LauncherSettings> =>
  inTauri ? invoke<LauncherSettings>("settings_get") : Promise.resolve(DEFAULT_SETTINGS);

export const saveSettings = (settings: LauncherSettings): Promise<void> =>
  inTauri ? invoke<void>("settings_save", { settings }) : Promise.resolve();

export const detectJava = (): Promise<JavaStatus> =>
  inTauri
    ? invoke<JavaStatus>("java_detect")
    : Promise.resolve({ found: false, path: null, version: null, source: "missing" });

export const installJava21 = (): Promise<JavaStatus> => invoke<JavaStatus>("java_install");

export const launchInstance = (req: LaunchRequest): Promise<void> =>
  invoke<void>("launch_instance", { req });

export const getInstanceDir = (instanceId: string): Promise<string> =>
  invoke<string>("open_instance_dir", { instanceId });

/** `instanceId` is null for launcher-wide notices. */
export interface LaunchStatusEvent {
  instanceId: string | null;
  message: string;
}

export interface GameStateEvent {
  instanceId: string;
  state: "running" | "stopped";
  exitCode: number | null;
  stoppedByUser: boolean;
}

export interface GameLogBatch {
  instanceId: string;
  lines: GameLogLine[];
}

export const stopGame = (instanceId: string): Promise<void> =>
  invoke<void>("game_stop", { instanceId });

export const getRunningInstances = (): Promise<string[]> =>
  inTauri ? invoke<string[]>("game_running") : Promise.resolve([]);

export const onLaunchStatus = (cb: (e: LaunchStatusEvent) => void): Promise<UnlistenFn> =>
  inTauri
    ? listen<LaunchStatusEvent>("launch-status", (e) => cb(e.payload))
    : Promise.resolve(() => {});

export const onGameState = (cb: (e: GameStateEvent) => void): Promise<UnlistenFn> =>
  inTauri
    ? listen<GameStateEvent>("game-state", (e) => cb(e.payload))
    : Promise.resolve(() => {});

export const onGameLog = (cb: (batch: GameLogBatch) => void): Promise<UnlistenFn> =>
  inTauri
    ? listen<GameLogBatch>("game-log", (e) => cb(e.payload))
    : Promise.resolve(() => {});
