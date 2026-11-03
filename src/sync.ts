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

export const getSyncState = (instanceId: string) =>
  inTauri
    ? invoke<InstanceState>("sync_get_state", { instanceId })
    : Promise.resolve({ installedVersion: null, disabledMods: [] });

export const setModEnabled = (instanceId: string, slug: string, enabled: boolean) =>
  invoke<InstanceState>("sync_set_mod_enabled", { instanceId, slug, enabled });

export const syncInstance = (instanceId: string, manifestUrl: string) =>
  invoke<InstanceState>("sync_instance", { instanceId, manifestUrl });

export const listCustomMods = (instanceId: string) =>
  inTauri ? invoke<CustomModFile[]>("sync_list_custom_mods", { instanceId }) : Promise.resolve([]);

export const getCustomModsDir = (instanceId: string) =>
  invoke<string>("sync_custom_mods_dir", { instanceId });

export const onSyncProgress = (cb: (p: SyncProgress) => void): Promise<UnlistenFn> =>
  inTauri ? listen<SyncProgress>("sync-progress", (e) => cb(e.payload)) : Promise.resolve(() => {});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
