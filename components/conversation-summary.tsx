import { Card, CardTitle } from "@/components/ui/card";
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

type CriteriaField = ContactField | MeetingField;

type ConversationSummaryProps = {
  /** Every turn so far, oldest first. The real state of the conversation. */
  transcripts: string[];
  /** The model's merged view. Read-only here. */
  state: ConversationState;
};

function displayValue(field: CriteriaField, value: string): string {
  if (field === "meetingDate") return formatMeetingDate(value) ?? value;
  if (field === "meetingTime") return formatMeetingTime(value) ?? value;
  if (field === "gender") return formatGender(value);
  return value;
}

function ValueRow({ field, value }: { field: CriteriaField; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="min-w-24 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {FIELD_LABELS[field]}
      </dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100">
        {displayValue(field, value)}
      </dd>
    </div>
  );
}

/**
 * What the assistant has understood, and the conversation it came from.
 *
 * Read-only by design. The criteria are derived from the transcripts by the model
 * on every turn, so there is nothing here a user could usefully edit — changing a
 * field would be overwritten by the next turn's re-derivation. Corrections are
 * spoken instead: "actually, Kandy" or "start over".
 *
 * The transcript list is shown because it, not the field list, is the actual state
 * of the conversation. If a value looks wrong, the reason is visible in what was
 * heard.
 */
export function ConversationSummary({
  transcripts,
  state,
}: ConversationSummaryProps) {
  const contactFields = populatedContactFields(state);
  const meetingFields = populatedMeetingFields(state);

  const unusedContactFields = CONTACT_FIELDS.filter(
    (field) => !contactFields.includes(field),
  );

  if (transcripts.length === 0) return null;

  return (
    <Card>
      <CardTitle
        hint={transcripts.length === 1 ? "1 turn" : `${transcripts.length} turns`}
      >
        Understood so far
      </CardTitle>

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Searching for
          </p>

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
          {unusedContactFields.length > 0 && contactFields.length > 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              You could also say the{" "}
              {unusedContactFields
                .map((field) => FIELD_LABELS[field].toLowerCase())
                .join(", ")}
              .
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Meeting
          </p>

          {meetingFields.length > 0 ? (
            <dl className="space-y-1">
              {meetingFields.map((field) => (
                <ValueRow key={field} field={field} value={state[field]} />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Not mentioned yet. You can say it, or fill it in before saving.
            </p>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Meeting details are not used to find the contact.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Conversation
          </p>

          <ol className="space-y-1.5">
            {transcripts.map((transcript, index) => (
              <li
                key={`${index}-${transcript.slice(0, 24)}`}
                className="flex gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500"
                >
                  {index + 1}.
                </span>
                <span>{transcript}</span>
              </li>
            ))}
          </ol>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            To change something, say it again — the latest mention wins. Say or press
            Start over to clear everything.
          </p>
        </div>
      </div>
    </Card>
  );
}
