"use client";

import { Card, CardTitle } from "@/components/ui/card";
import {
  formatGender,
  formatMeetingDate,
  formatMeetingTime,
} from "@/lib/format";
import {
  CONTACT_FIELDS,
  FIELD_LABELS,
  MEETING_FIELDS,
  populatedContactFields,
  populatedMeetingFields,
  type ContactField,
  type ConversationState,
  type MeetingField,
} from "@/schemas/meeting-request";

type CriteriaField = ContactField | MeetingField;

type CriteriaChipsProps = {
  state: ConversationState;
  busy: boolean;
  onRemove: (field: CriteriaField) => void;
};

/** Renders a stored value the way a person would expect to read it. */
function displayValue(field: CriteriaField, value: string): string {
  if (field === "meetingDate") return formatMeetingDate(value) ?? value;
  if (field === "meetingTime") return formatMeetingTime(value) ?? value;
  if (field === "gender") return formatGender(value);
  return value;
}

function Chip({
  field,
  value,
  busy,
  onRemove,
}: {
  field: CriteriaField;
  value: string;
  busy: boolean;
  onRemove: (field: CriteriaField) => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1.5 text-sm dark:border-indigo-900 dark:bg-indigo-950/50">
      <span className="text-xs font-medium uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
        {FIELD_LABELS[field]}
      </span>
      <span className="truncate text-slate-900 dark:text-slate-100">
        {displayValue(field, value)}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(field)}
        aria-label={`Remove ${FIELD_LABELS[field]} ${displayValue(field, value)}`}
        className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-indigo-600 transition-colors hover:bg-indigo-200 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-indigo-900"
      >
        <span aria-hidden="true">×</span>
      </button>
    </span>
  );
}

/**
 * The accumulated search criteria, as removable chips.
 *
 * Two jobs. It proves earlier turns were not forgotten, which is the main thing a
 * user needs to trust a multi-turn flow. And it provides an escape hatch: speech
 * extraction sometimes captures the wrong city, and removing a chip is faster than
 * starting over.
 *
 * Contact and meeting fields are shown separately because they behave differently
 * — only the contact group narrows the directory search.
 */
export function CriteriaChips({ state, busy, onRemove }: CriteriaChipsProps) {
  const contactFields = populatedContactFields(state);
  const meetingFields = populatedMeetingFields(state);

  const unusedContactFields = CONTACT_FIELDS.filter(
    (field) => !contactFields.includes(field),
  );

  if (contactFields.length === 0 && meetingFields.length === 0) return null;

  return (
    <Card>
      <CardTitle hint="Kept across turns">Search criteria</CardTitle>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Searching for
          </p>

          {contactFields.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {contactFields.map((field) => (
                <Chip
                  key={field}
                  field={field}
                  value={state[field]}
                  busy={busy}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing yet. Say a name to start searching.
            </p>
          )}

          {/* Doubles as the answer to "what should I say next?" */}
          {unusedContactFields.length > 0 && contactFields.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              You could also add:{" "}
              {unusedContactFields
                .map((field) => FIELD_LABELS[field].toLowerCase())
                .join(", ")}
              .
            </p>
          ) : null}
        </div>

        {meetingFields.length > 0 ? (
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Meeting
            </p>
            <div className="flex flex-wrap gap-2">
              {meetingFields.map((field) => (
                <Chip
                  key={field}
                  field={field}
                  value={state[field]}
                  busy={busy}
                  onRemove={onRemove}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Meeting details are not used to find the contact.
            </p>
          </div>
        ) : (
          <div className="border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            No meeting details yet. You can add the date, time and purpose in any
            turn, or fill them in before saving.
          </div>
        )}
      </div>

      <p className="sr-only">
        {MEETING_FIELDS.length + CONTACT_FIELDS.length} fields tracked in total.
      </p>
    </Card>
  );
}
