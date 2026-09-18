import { formatMeetingDate, formatMeetingTime } from "@/lib/format";
import type { SavedMeeting } from "@/types/api";

const FROZEN_FIELD_CLASSES =
  "mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 " +
  "dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300";

const LABEL_CLASSES =
  "block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

/**
 * The meeting form after it has been submitted, frozen at the written values.
 *
 * A separate component rather than a read-only mode on `MeetingForm`. That form owns
 * validation, submit and the remount-on-new-values key; threading a second mode
 * through it would put a display concern inside the only code path that writes to the
 * database. This renders from the `SavedMeeting` the API echoed back, so what is shown
 * is what was actually stored rather than what was in the inputs.
 *
 * Disabled inputs rather than plain text, so the message still reads as the form it
 * was. They are not focusable, which is correct — there is nothing left to do here.
 */
export function SubmittedMeeting({ meeting }: { meeting: SavedMeeting }) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
        Meeting details submitted
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={LABEL_CLASSES}>Date</span>
          <p className={FROZEN_FIELD_CLASSES}>
            {formatMeetingDate(meeting.date) ?? meeting.date}
          </p>
        </div>

        <div>
          <span className={LABEL_CLASSES}>Time</span>
          <p className={FROZEN_FIELD_CLASSES}>
            {formatMeetingTime(meeting.time) ?? meeting.time}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <span className={LABEL_CLASSES}>Notes</span>
        <p className={`${FROZEN_FIELD_CLASSES} whitespace-pre-wrap`}>
          {meeting.description}
        </p>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Scheduled with {meeting.userLabel}. No longer editable.
      </p>
    </div>
  );
}
