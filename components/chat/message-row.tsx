import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Positions one message and gives it its container.
 *
 * Alignment carries the speaker: yours on the right, the assistant's on the left.
 * Deliberately plain panels rather than speech bubbles with tails — the assistant
 * side holds result lists and a form with real inputs, and bubble chrome around a
 * date picker looks like a mistake.
 *
 * The two sides get different max widths for that reason. A transcript is a sentence
 * and reads better narrow; a result list needs the room.
 */
export function MessageRow({
  align,
  children,
  className,
}: {
  align: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "min-w-0 rounded-2xl border px-3.5 py-2.5",
          align === "right"
            ? "max-w-[85%] border-indigo-200 bg-indigo-50 sm:max-w-[75%] dark:border-indigo-900 dark:bg-indigo-950/40"
            : "w-full border-slate-200 bg-white sm:max-w-[90%] dark:border-slate-800 dark:bg-slate-900",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
