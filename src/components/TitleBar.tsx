import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import horizontalLogo from "../assets/petablocks-logo-horizontal-256w.png";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const win = () => (inTauri ? getCurrentWindow() : null);

export default function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="flex h-11 items-center justify-between border-b border-white/10 bg-pb-bg pl-3.5"
    >
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <img
          src={horizontalLogo}
          alt="PETABLOCKS"
          className="h-5 w-auto object-contain"
          draggable={false}
        />
        <span
          data-tauri-drag-region
          className="font-minecraft text-sm tracking-[0.18em] pb-text-gradient-purple"
        >
          LAUNCHER
        </span>
      </div>
      <div className="flex h-full">
        <button
          onClick={() => win()?.minimize()}
          className="w-11 text-pb-muted hover:bg-white/10"
          aria-label="Minimize"
        >
          <Minus size={14} className="mx-auto" />
        </button>
        <button
          onClick={() => win()?.toggleMaximize()}
          className="w-11 text-pb-muted hover:bg-white/10"
          aria-label="Maximize"
        >
          <Square size={12} className="mx-auto" />
        </button>
        <button
          onClick={() => win()?.close()}
          className="w-11 text-pb-muted hover:bg-red-500 hover:text-white"
          aria-label="Close"
        >
          <X size={14} className="mx-auto" />
        </button>
      </div>
    </header>
  );
}
