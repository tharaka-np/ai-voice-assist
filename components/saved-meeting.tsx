import { CheckIcon } from "@/components/icons";
import { formatMeetingDate, formatMeetingTime } from "@/lib/format";
import type { SavedMeeting } from "@/types/api";

/**
 * The write confirmation, as the message that follows the frozen form.
 *
 * Deliberately compact. The frozen form above it already shows the date, time and
 * notes, so repeating them here would be the third copy of the same three values.
 * What this adds is the part only the database knows: that the row exists, and its id.
 * Reporting the id keeps the outcome verifiable rather than a generic "saved".
 */
export function SavedMeetingCard({ meeting }: { meeting: SavedMeeting }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500"
      >
        <CheckIcon className="size-3" />
      </span>

      <div className="min-w-0">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Saved as meeting #{meeting.id}
        </p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          {meeting.userLabel} · {formatMeetingDate(meeting.date)} at{" "}
          {formatMeetingTime(meeting.time)}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          Written to the meetings table for directory ID {meeting.userId}.
        </p>
      </div>
    </div>
  );
}
