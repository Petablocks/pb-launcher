import { HTMLAttributes } from "react";
import { cn } from "./cn";

export type Tone = "cyan" | "mint" | "amber" | "purple" | "red" | "neutral";

const TONES: Record<Tone, string> = {
  cyan: "border-pb-cyan/30 bg-pb-cyan/15 text-pb-cyan",
  mint: "border-pb-mint/30 bg-pb-mint/10 text-pb-mint",
  amber: "border-amber-400/40 bg-amber-500/15 text-amber-300",
  purple: "border-pb-purple/40 bg-pb-purple/15 text-pb-purple",
  red: "border-red-500/30 bg-red-500/10 text-red-300",
  neutral: "border-white/15 bg-black/50 text-white",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-2xs font-bold",
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
