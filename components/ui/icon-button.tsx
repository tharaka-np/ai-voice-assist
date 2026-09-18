import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type IconButtonTone = "primary" | "danger" | "ghost";

/**
 * A round, icon-only button.
 *
 * Separate from `Button` rather than a variant of it because `Button` hardcodes
 * `rounded-lg` and horizontal padding in its base classes, and `cn` is a plain join
 * with no conflict resolution — overriding those through `className` would depend on
 * stylesheet order rather than intent.
 *
 * `label` is required, not optional. An icon-only control has no text to fall back
 * on, so leaving the accessible name to a caller's discretion is how you end up with
 * a button screen readers announce as "button".
 */
export function IconButton({
  tone = "primary",
  label,
  className,
  type = "button",
  children,
  ...props
}: ComponentProps<"button"> & { tone?: IconButtonTone; label: string }) {
  const toneClasses: Record<IconButtonTone, string> = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 disabled:hover:bg-indigo-600",
    danger: "bg-rose-600 text-white hover:bg-rose-500 disabled:hover:bg-rose-600",
    ghost:
      "text-slate-500 hover:bg-slate-100 hover:text-slate-900 " +
      "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
  };

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
