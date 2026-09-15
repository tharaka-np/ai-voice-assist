import { Card, CardTitle } from "@/components/ui/card";
import { formatMeetingDate, formatMeetingTime } from "@/lib/format";
import type { SavedMeeting } from "@/types/api";

/**
 * Terminal success state.
 *
 * Reports exactly what was written, including the database id, so the outcome is
 * verifiable rather than a generic "saved" toast.
 */
export function SavedMeetingCard({ meeting }: { meeting: SavedMeeting }) {
  return (
    <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
      <CardTitle hint={`Meeting #${meeting.id}`}>Saved</CardTitle>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Person
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
            {meeting.userLabel}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Date
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
            {formatMeetingDate(meeting.date)}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Time
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
            {formatMeetingTime(meeting.time)}
          </dd>
        </div>

        <div className="sm:col-span-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Description
          </dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
            {meeting.description}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-emerald-800 dark:text-emerald-300">
        Written to the meetings table for directory ID {meeting.userId}.
      </p>
    </Card>
  );
}
