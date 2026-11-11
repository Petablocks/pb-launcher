import { HTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

/** Standard page heading: title, one-line description and trailing actions. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered next to the title (e.g. the instance switcher). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">{title}</h1>
          {children}
        </div>
        {description && <p className="mt-1 text-sm text-pb-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-2xl border border-white/10 bg-pb-card p-6", className)} {...rest} />;
}

/** Icon tile + title + description used at the top of a settings-style card. */
export function CardHeader({
  icon,
  title,
  description,
  actions,
  tone = "cyan",
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "cyan" | "purple" | "amber" | "discord";
}) {
  const tones = {
    cyan: "bg-pb-cyan/15 text-pb-cyan",
    purple: "bg-pb-purple/15 text-pb-purple",
    amber: "bg-amber-400/15 text-amber-300",
    discord: "bg-discord/15 text-discord",
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base">{title}</h2>
          {description && <p className="text-xs text-pb-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-pb-card p-12 text-sm text-pb-muted"
    >
      <Loader2 size={20} className="animate-spin text-pb-cyan" /> {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-xs text-pb-muted">
      {icon && <div className="mx-auto mb-3 flex justify-center text-pb-muted/60">{icon}</div>}
      {title && <div className="text-sm font-bold text-white">{title}</div>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-black/40"
    >
      <div className="h-full rounded-full bg-pb-cyan transition-[width] duration-200" style={{ width: `${clamped}%` }} />
    </div>
  );
}
