import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type AlertTone = "error" | "info";

const TONE_CLASSES: Record<AlertTone, string> = {
  error:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200",
  info: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
};

/**
 * Errors use `role="alert"` so assistive technology announces them
 * immediately; informational notes use a polite live region instead.
 */
export function Alert({
  tone = "error",
  title,
  children,
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", TONE_CLASSES[tone])}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
