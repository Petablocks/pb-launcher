import { openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "../auth";

/** Opens a URL in the player's default browser (or a new tab during web development). */
export function openExternal(url: string) {
  if (inTauri) openUrl(url).catch(() => {});
  else window.open(url, "_blank", "noopener");
}
