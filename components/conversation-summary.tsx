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
  utterances,
  state,
}: ConversationSummaryProps) {
  const contactFields = populatedContactFields(state);
  const meetingFields = populatedMeetingFields(state);

  const unusedContactFields = CONTACT_FIELDS.filter(
    (field) => !contactFields.includes(field),
  );

  if (utterances.length === 0) return null;

  const criteriaTurns = utterances.length;

  return (
    <Card>
      <CardTitle hint={criteriaTurns === 1 ? "1 turn" : `${criteriaTurns} turns`}>
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

          {/* Every utterance is a numbered turn. A sentence that also chose a
              result gets a badge rather than being pushed out of the sequence,
              because it contributed criteria too. */}
          <ol className="space-y-1.5">
            {utterances.map((utterance, index) => (
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

                <span className="text-slate-700 dark:text-slate-300">
                  {utterance.text}
                  {utterance.selectedPosition !== null ? (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      selected #{utterance.selectedPosition}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            To change something, say it again — the latest mention wins. You can pick
            a result and give meeting details in the same sentence.
          </p>
        </div>
      </div>
    </Card>
  );
}
