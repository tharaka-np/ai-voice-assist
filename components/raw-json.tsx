"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

/**
 * Collapsible raw payload with a copy action.
 *
 * Uses a native `<details>` element so it is keyboard accessible and expandable
 * without JavaScript.
 */
export function RawJson({ value }: { value: unknown }) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serialized = JSON.stringify(value, null, 2);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);

    try {
      // Unavailable on insecure origins and in some older browsers.
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(serialized);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    resetTimerRef.current = setTimeout(() => setCopyState("idle"), 2_000);
  }, [serialized]);

  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
      <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-200">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="text-slate-400 transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          Raw JSON
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          <code>{serialized}</code>
        </pre>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleCopy}>
            Copy JSON
          </Button>
          <span
            aria-live="polite"
            className="text-xs text-slate-500 dark:text-slate-400"
          >
            {copyState === "copied" ? "Copied to clipboard." : null}
            {copyState === "failed"
              ? "Couldn't copy automatically. Select the text and copy manually."
              : null}
          </span>
        </div>
      </div>
    </details>
  );
}
