import { invoke } from "@tauri-apps/api/core";

export interface Profile { uuid: string; name: string }
export interface Session { profile: Profile; access_token: string; offline: boolean }
export interface DeviceCodeInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const startLogin = () => invoke<DeviceCodeInfo>("auth_start_login");
export const completeLogin = (d: DeviceCodeInfo) =>
  invoke<Session>("auth_complete_login", { deviceCode: d.device_code, interval: d.interval, expiresIn: d.expires_in });
export const restoreSession = () => (inTauri ? invoke<Session | null>("auth_restore") : Promise.resolve(null));
export const logout = () => invoke<void>("auth_logout");

export const avatarUrl = (uuid: string, size = 64) => `https://crafthead.net/helm/${uuid}/${size}`;
export const bodySkinUrl = (uuid: string, _size = 128) => `https://crafthead.net/armor/body/${uuid}`;
