import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "warning"
  | "discord"
  | "support";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-pb-cyan text-pb-ink font-extrabold hover:brightness-110",
  secondary:
    "border border-white/10 bg-white/5 text-white font-semibold hover:border-pb-cyan/50 hover:text-pb-cyan",
  ghost: "text-pb-muted font-semibold hover:bg-white/10 hover:text-white",
  danger: "border border-red-500/30 text-red-300 font-bold hover:bg-red-500/15",
  warning: "bg-amber-400 text-black font-extrabold hover:bg-amber-300",
  discord: "bg-discord text-white font-bold hover:brightness-110",
  support: "bg-bmc text-black font-extrabold hover:brightness-105",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "gap-1.5 rounded-lg px-3 py-1.5 text-xs",
  md: "gap-2 rounded-xl px-3.5 py-2 text-xs",
  lg: "gap-2 rounded-xl px-5 py-2.5 text-sm",
  xl: "gap-2.5 rounded-2xl px-8 py-3.5 text-lg",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    block = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap transition",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === "xl" ? 20 : 14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
}

export function IconButton({ label, className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-pb-muted transition",
        "hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
