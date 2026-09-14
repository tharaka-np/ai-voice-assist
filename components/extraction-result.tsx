import { RawJson } from "@/components/raw-json";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMeetingDate, formatMeetingTime } from "@/lib/format";
import type { MeetingInfo } from "@/schemas/meeting";
import type { TranscriptionMeta } from "@/types/api";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={
          value === null
            ? "mt-1 text-sm italic text-slate-400 dark:text-slate-500"
            : "mt-1 text-sm text-slate-900 dark:text-slate-100"
        }
      >
        {value ?? "Not mentioned"}
      </dd>
    </div>
  );
}

/**
 * Human-readable view of the extracted record, plus the exact payload.
 *
 * Nulls are rendered as an explicit "Not mentioned" rather than being hidden,
 * so a missing value is visibly a missing value and not a rendering bug.
 */
export function ExtractionResult({
  data,
  transcription,
}: {
  data: MeetingInfo;
  transcription: TranscriptionMeta;
}) {
  return (
    <Card>
      <CardTitle hint={`via ${transcription.label}`}>
        Extracted information
      </CardTitle>

      <dl className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" value={data.name} />
        <Field label="Meeting date" value={formatMeetingDate(data.meetingDate)} />
        <Field label="Meeting time" value={formatMeetingTime(data.meetingTime)} />
        <div className="sm:col-span-2">
          <Field label="Notes" value={data.notes} />
        </div>
      </dl>

      <div className="mt-6">
        <RawJson value={data} />
      </div>
    </Card>
  );
}
