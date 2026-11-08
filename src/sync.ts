import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { inTauri } from "./auth";

export interface LauncherMod {
  slug: string;
  path: string;
  url: string;
  sha1: string;
  size: number;
  category: string;
  optional: boolean;
  default: boolean;
  notes: string;
}

export interface LauncherManifest {
  formatVersion: number;
  version: string;
  name: string;
  minecraft: string;
  loader: string;
  neoforge: string;
  mrpackUrl: string;
  mods: LauncherMod[];
}

export interface InstanceState {
  installedVersion: string | null;
  disabledMods: string[];
  totalPlaytimeSeconds?: number;
  sessionsPlayed?: number;
  lastPlayedEpoch?: number | null;
}

export interface PackEntry {
  filename: string;
  cleanName: string;
  size: number;
  enabled: boolean;
  active: boolean;
  kind: "shader" | "resourcepack";
}

export interface SyncProgress {
  instanceId: string;
  stage: string;
  current: number;
  total: number;
  detail: string;
}

export interface CustomModFile {
  filename: string;
  size: number;
}

export const getManifest = (instanceId: string, manifestUrl: string) =>
  inTauri
    ? invoke<LauncherManifest>("sync_get_manifest", { instanceId, manifestUrl })
    : Promise.reject(new Error("Requires Tauri runtime"));

export const getChangelog = (instanceId: string, changelogUrl: string) =>
  inTauri
    ? invoke<string>("sync_get_changelog", { instanceId, changelogUrl })
    : Promise.reject(new Error("Requires Tauri runtime"));

export const getSyncState = (instanceId: string): Promise<InstanceState> =>
  inTauri
    ? invoke<InstanceState>("sync_get_state", { instanceId })
    : Promise.resolve({
        installedVersion: null,
        disabledMods: [],
        totalPlaytimeSeconds: 0,
        sessionsPlayed: 0,
        lastPlayedEpoch: null,
      });

export const setModEnabled = (instanceId: string, slug: string, enabled: boolean) =>
  invoke<InstanceState>("sync_set_mod_enabled", { instanceId, slug, enabled });

export const syncInstance = (instanceId: string, manifestUrl: string) =>
  invoke<InstanceState>("sync_instance", { instanceId, manifestUrl });

export const listCustomMods = (instanceId: string) =>
  inTauri ? invoke<CustomModFile[]>("sync_list_custom_mods", { instanceId }) : Promise.resolve([]);

export const getCustomModsDir = (instanceId: string) =>
  invoke<string>("sync_custom_mods_dir", { instanceId });

export const listPacks = (instanceId: string): Promise<PackEntry[]> =>
  inTauri ? invoke<PackEntry[]>("packs_list", { instanceId }) : Promise.resolve([]);

export const setPackEnabled = (
  instanceId: string,
  kind: "shader" | "resourcepack",
  filename: string,
  enabled: boolean
): Promise<PackEntry[]> =>
  invoke<PackEntry[]>("packs_set_enabled", { instanceId, kind, filename, enabled });

export const setActiveShader = (
  instanceId: string,
  shaderFilename: string | null
): Promise<PackEntry[]> =>
  invoke<PackEntry[]>("packs_set_active_shader", { instanceId, shaderFilename });

export const openPacksDir = (instanceId: string, kind: "shader" | "resourcepack"): Promise<string> =>
  invoke<string>("packs_open_dir", { instanceId, kind });

export const onSyncProgress = (cb: (p: SyncProgress) => void): Promise<UnlistenFn> =>
  inTauri ? listen<SyncProgress>("sync-progress", (e) => cb(e.payload)) : Promise.resolve(() => {});

export const onPlaytimeUpdated = (
  cb: (instanceId: string, state: InstanceState) => void
): Promise<UnlistenFn> =>
  inTauri
    ? listen<[string, InstanceState]>("playtime-updated", (e) => cb(e.payload[0], e.payload[1]))
    : Promise.resolve(() => {});

export function formatPlaytime(seconds = 0): string {
  if (seconds < 60) return "0m";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
