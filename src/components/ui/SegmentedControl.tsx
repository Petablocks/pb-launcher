import { ReactNode } from "react";
import { cn } from "./cn";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Segment<T>[];
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

/** Single-choice pill group (filters, instance switcher). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-1 rounded-xl border border-white/10 bg-pb-card p-1", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold transition",
              selected ? "bg-pb-cyan text-pb-ink" : "text-pb-muted hover:bg-white/5 hover:text-white",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
