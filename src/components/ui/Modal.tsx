import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered before the title (usually an icon). */
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hide the title visually while keeping it as the dialog's accessible name. */
  hideTitle?: boolean;
}

const WIDTHS = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl" };

/**
 * Accessible dialog: labelled, closes on Escape and backdrop click, traps Tab focus while open
 * and returns focus to the element that opened it.
 */
export function Modal({ open, onClose, title, icon, children, footer, size = "md", hideTitle }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "pb-modal-in flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-pb-surface shadow-2xl outline-none",
          WIDTHS[size],
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-6 py-4",
            !hideTitle && "border-b border-white/10",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {!hideTitle && icon}
            <h3
              id={titleId}
              className={cn("truncate text-base font-extrabold text-white", hideTitle && "sr-only")}
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-lg p-1.5 text-pb-muted transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6", hideTitle ? "pb-6" : "py-5")}>
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
