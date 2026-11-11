import { cn } from "./cn";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name for the control. */
  label: string;
  disabled?: boolean;
  tone?: "cyan" | "mint";
}

export function Switch({ checked, onChange, label, disabled, tone = "cyan" }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? (tone === "mint" ? "bg-pb-mint" : "bg-pb-cyan") : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full transition",
          checked ? "translate-x-6 bg-pb-ink" : "translate-x-1 bg-white",
        )}
      />
    </button>
  );
}
