"use client";

import { cn } from "@/lib/cn";
import type {
  TranscriptionProviderId,
  TranscriptionProviderOption,
} from "@/lib/transcription/types";

type ProviderSelectorProps = {
  options: TranscriptionProviderOption[];
  value: TranscriptionProviderId;
  disabled: boolean;
  onChange: (id: TranscriptionProviderId) => void;
};

/**
 * Transcription engine picker.
 *
 * A real radio group rather than styled buttons, so arrow keys move between
 * options and screen readers announce the group and the selection. Unavailable
 * providers stay visible but disabled: hiding them would make a missing API key
 * look like a missing feature.
 */
export function ProviderSelector({
  options,
  value,
  disabled,
  onChange,
}: ProviderSelectorProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Transcription engine
      </legend>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = option.id === value;
          const isDisabled = disabled || !option.available;

          return (
            <label
              key={option.id}
              className={cn(
                "relative flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                isSelected
                  ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40"
                  : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
                isDisabled && "cursor-not-allowed opacity-60 hover:bg-white dark:hover:bg-slate-900",
              )}
            >
              <input
                type="radio"
                name="transcription-provider"
                value={option.id}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onChange(option.id)}
                className="mt-0.5 size-4 shrink-0 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              />

              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {option.label}
                  </span>
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {option.model}
                  </code>
                </span>

                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {option.available
                    ? option.description
                    : "Not configured on this server."}
                </span>

                {/* Makes the keyterm feature visible before recording, which is
                    the point at which it is worth explaining. */}
                {option.keyterms.length > 0 ? (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {option.keyterms.map((term) => (
                      <span
                        key={term}
                        className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      >
                        {term}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
