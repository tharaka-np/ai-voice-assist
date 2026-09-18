import type { SystemMessage } from "@/components/chat/types";
import { cn } from "@/lib/cn";

/**
 * A notice about the conversation rather than a turn in it.
 *
 * Centred and full width, so it reads as a divider in the log rather than as
 * something either side said.
 */
export function SystemNotice({ message }: { message: SystemMessage }) {
  return (
    <div
      role={message.tone === "warning" ? "alert" : "status"}
      className={cn(
        "mx-auto max-w-md rounded-xl border px-3 py-2 text-center text-xs",
        message.tone === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
      )}
    >
      {message.text}
    </div>
  );
}
