import type { ReactNode } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  formatGender,
  formatMeetingDate,
  formatMeetingTime,
} from "@/lib/format";
import {
  CONTACT_FIELDS,
  FIELD_LABELS,
  populatedContactFields,
  populatedMeetingFields,
  type ContactField,
  type ConversationState,
  type MeetingField,
} from "@/schemas/meeting-request";
import type { TranscriptionMeta } from "@/types/api";

type CriteriaField = ContactField | MeetingField;

/**
 * Everything the user has said, including commands.
 *
 * Display only. Commands are shown but never sent to the model, so this list is
 * intentionally *not* the same as the transcript history that drives extraction.
 */
export type Utterance = {
  text: string;
  /**
   * The position this sentence chose, when it chose one.
   *
   * Every utterance is a real turn — a sentence can name a position *and* carry
   * criteria — so this is a badge on the turn, not a separate category.
   */
  selectedPosition: number | null;
};

type ConversationSummaryProps = {
  /** Everything heard, oldest first, commands included. */
  utterances: Utterance[];
  /** The model's merged view. Read-only here. */
  state: ConversationState;
  /**
   * Whether to show the meeting values.
   *
   * False once the meeting form is open, because the form shows the same three
   * values and lets the user edit them. Two copies of one value, one editable and
   * one not, is a question the UI shouldn't be asking.
   */
  showMeeting: boolean;
  /**
   * Which engine produced the newest transcript, or null before the first turn.
   *
   * Attached to the last turn in the list rather than given its own card. The
   * transcript used to appear twice — once in a `Transcript` card and once as the
   * final item here — and this is the half worth keeping, because it sits in the
   * sequence that explains where the criteria came from.
   */
  transcription: TranscriptionMeta | null;
};

/** How many "you could also say" suggestions to name before it becomes noise. */
const MAX_SUGGESTIONS = 3;

function displayValue(field: CriteriaField, value: string): string {
  if (field === "meetingDate") return formatMeetingDate(value) ?? value;
  if (field === "meetingTime") return formatMeetingTime(value) ?? value;
  if (field === "gender") return formatGender(value);
  return value;
}

function ValueRow({ field, value }: { field: CriteriaField; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {FIELD_LABELS[field]}
      </dt>
      <dd className="min-w-0 truncate text-sm text-slate-900 dark:text-slate-100">
        {displayValue(field, value)}
      </dd>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  );
}

/**
 * The conversation rail: what the assistant understood, and the turns it came from.
 *
 * Read-only by design. The criteria are derived from the transcripts by the model on
 * every turn, so there is nothing here a user could usefully edit — a change would be
 * overwritten by the next turn's re-derivation. Corrections are spoken.
 *
 * The turn list scrolls within a fixed height rather than growing the page. It is the
 * only part of this screen that grows without bound, and in a sticky rail an unbounded
 * list would eventually push the rest out of view.
 */
export function ConversationSummary({
  utterances,
  state,
  showMeeting,
  transcription,
}: ConversationSummaryProps) {
  if (utterances.length === 0) return null;

  const contactFields = populatedContactFields(state);
  const meetingFields = populatedMeetingFields(state);

  const suggestions = CONTACT_FIELDS.filter(
    (field) => !contactFields.includes(field),
  ).slice(0, MAX_SUGGESTIONS);

  const lastIndex = utterances.length - 1;

  return (
    <Card>
      <CardTitle
        hint={utterances.length === 1 ? "1 turn" : `${utterances.length} turns`}
      >
        Understood so far
      </CardTitle>

      <div className="space-y-4">
        <div>
          <SectionLabel>Searching for</SectionLabel>

          {contactFields.length > 0 ? (
            <dl className="space-y-1">
              {contactFields.map((field) => (
                <ValueRow key={field} field={field} value={state[field]} />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No contact details yet. Say a name to start searching.
            </p>
          )}

          {/* Doubles as the answer to "what should I say next?" */}
          {suggestions.length > 0 && contactFields.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Try adding{" "}
              {suggestions
                .map((field) => FIELD_LABELS[field].toLowerCase())
                .join(", ")}
              .
            </p>
          ) : null}
        </div>

        {showMeeting && meetingFields.length > 0 ? (
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <SectionLabel>Meeting</SectionLabel>
            <dl className="space-y-1">
              {meetingFields.map((field) => (
                <ValueRow key={field} field={field} value={state[field]} />
              ))}
            </dl>
          </div>
        ) : null}

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <SectionLabel>Turns</SectionLabel>

          {/* Every utterance is a numbered turn. A sentence that also chose a result
              gets a badge rather than being pushed out of the sequence, because it
              contributed criteria too. */}
          <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {utterances.map((utterance, index) => {
              const isLatest = index === lastIndex;

              return (
                <li
                  key={`${index}-${utterance.text.slice(0, 24)}`}
                  className="flex gap-2 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-4 shrink-0 text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500"
                  >
                    {index + 1}.
                  </span>

                  <span className="min-w-0">
                    <span
                      className={cn(
                        isLatest
                          ? "text-slate-900 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-400",
                      )}
                    >
                      {utterance.text}
                    </span>

                    {utterance.selectedPosition !== null ? (
                      <span className="ml-2 whitespace-nowrap rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        selected #{utterance.selectedPosition}
                      </span>
                    ) : null}

                    {/* Which engine heard this, on the turn it applies to. Comparing
                        two engines is the point of the picker, and that only means
                        something if the result says which one ran. */}
                    {isLatest && transcription !== null ? (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium">{transcription.label}</span>
                        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
                          {transcription.model}
                        </code>
                        <span>
                          {(transcription.latencyMs / 1000).toFixed(1)}s
                        </span>
                        {transcription.keytermCount > 0 ? (
                          <span>
                            {transcription.keytermCount} boosted{" "}
                            {transcription.keytermCount === 1 ? "name" : "names"}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Say something again to change it — the latest mention wins.
          </p>
        </div>
      </div>
    </Card>
  );
}
