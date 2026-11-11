import { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "./cn";

type AlertTone = "error" | "warning" | "info" | "success" | "progress";

const TONES: Record<AlertTone, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-200",
  warning: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  info: "border-pb-cyan/30 bg-pb-cyan/10 text-white",
  success: "border-pb-mint/30 bg-pb-mint/10 text-white",
  progress: "border-pb-cyan/30 bg-pb-cyan/10 text-white",
};

const ICONS: Record<AlertTone, ReactNode> = {
  error: <AlertTriangle size={15} className="text-red-400" />,
  warning: <AlertTriangle size={15} className="text-amber-300" />,
  info: <Info size={15} className="text-pb-cyan" />,
  success: <CheckCircle2 size={15} className="text-pb-mint" />,
  progress: <Loader2 size={15} className="animate-spin text-pb-cyan" />,
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  /** Buttons rendered at the trailing edge. */
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ tone = "info", title, children, actions, onDismiss, className }: AlertProps) {
  return (
    <div
      // Errors interrupt; everything else is announced politely.
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-center gap-3 rounded-xl border p-3 text-xs", TONES[tone], className)}
    >
      <span className="shrink-0">{ICONS[tone]}</span>
      <div className="min-w-0 flex-1 select-text">
        {title && <div className="font-bold text-white">{title}</div>}
        {children && <div className={cn("break-words", title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
