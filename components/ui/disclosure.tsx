import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * A collapsible section built on native `<details>`.
 *
 * Native rather than a button plus state, for three reasons: keyboard and screen
 * reader behaviour come for free, the content is correctly hidden from the
 * accessibility tree when closed, and it works before hydration.
 *
 * `open` is deliberately not a controlled React prop. The parent re-renders on
 * every conversational turn, and a controlled `open={false}` would slam a section
 * shut underneath a user who had just opened it. Rendering the attribute only for
 * the initial-open case leaves the element's own state alone thereafter.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  summaryClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
}) {
  return (
    <details className={cn("group", className)} {...(defaultOpen ? { open: true } : {})}>
      <summary
        className={cn(
          // `list-none` plus the WebKit pseudo-element removes both marker styles;
          // the chevron below replaces them so the affordance is still visible.
          "flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
          "[&::-webkit-details-marker]:hidden",
          summaryClassName,
        )}
      >
        {summary}

        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180 motion-reduce:transition-none dark:text-slate-500"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>

      <div className="mt-3">{children}</div>
    </details>
  );
}
