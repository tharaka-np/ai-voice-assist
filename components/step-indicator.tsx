import { cn } from "@/lib/cn";

export type FlowStep = "describe" | "choose" | "confirm" | "saved";

const STEPS = [
  { id: "describe", label: "Describe" },
  { id: "choose", label: "Choose" },
  { id: "confirm", label: "Confirm" },
] as const;

/** How far along each step is, which decides both the styling and the a11y text. */
type Standing = "done" | "current" | "todo";

function standingFor(index: number, activeIndex: number): Standing {
  if (index < activeIndex) return "done";
  if (index === activeIndex) return "current";
  return "todo";
}

/**
 * Where the user is in the flow, derived entirely from existing state.
 *
 * Purely presentational: it reads the step it is given and owns no logic about how
 * that step was reached. Its job is to answer "what happens next", which the old
 * layout answered with three separate paragraphs of hint text.
 *
 * Conveyed by text as well as colour — each step carries a visually hidden status
 * word, so the current position does not depend on seeing the accent.
 */
export function StepIndicator({ step }: { step: FlowStep }) {
  // "saved" sits past the end, so every step reads as done.
  const activeIndex =
    step === "saved" ? STEPS.length : STEPS.findIndex((item) => item.id === step);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEPS.map((item, index) => {
        const standing = standingFor(index, activeIndex);

        return (
          <li key={item.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                standing === "current" &&
                  "bg-indigo-600 text-white dark:bg-indigo-500",
                standing === "done" &&
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
                standing === "todo" &&
                  "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
              )}
            >
              {standing === "done" ? "✓" : index + 1}
            </span>

            <span
              className={cn(
                "font-medium",
                standing === "current"
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400",
              )}
            >
              {item.label}
              <span className="sr-only">
                {standing === "current"
                  ? " (current step)"
                  : standing === "done"
                    ? " (done)"
                    : " (not started)"}
              </span>
            </span>

            {index < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className="h-px w-4 bg-slate-200 sm:w-8 dark:bg-slate-700"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
