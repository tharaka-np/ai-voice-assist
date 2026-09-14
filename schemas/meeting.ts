import { z } from "zod";

import {
  defineExtractionSchema,
  nullableString,
  type StrictObjectJsonSchema,
} from "./extraction-schema";

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Placeholders a model sometimes emits instead of a real null. */
const NULL_LIKE_VALUES = new Set([
  "null",
  "none",
  "n/a",
  "na",
  "unknown",
  "not specified",
  "not mentioned",
  "not provided",
  "undefined",
]);

/**
 * Rejects well-formed but impossible dates such as `2026-02-31`, which a regex
 * alone will happily accept.
 */
export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));

  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

/**
 * The validated contract returned by `POST /api/process-audio`.
 *
 * Every field is `string | null`: the extractor is instructed to return null
 * rather than guess, and the date/time fields additionally have to be in the
 * agreed machine format. Format violations fail loudly instead of being
 * silently forwarded to the client.
 */
export const MeetingInfoSchema = z.object({
  name: z.string().min(1).nullable(),
  meetingDate: z
    .string()
    .regex(ISO_DATE_PATTERN, "meetingDate must use the YYYY-MM-DD format")
    .refine(isRealCalendarDate, "meetingDate must be a real calendar date")
    .nullable(),
  meetingTime: z
    .string()
    .regex(HH_MM_PATTERN, "meetingTime must use the 24-hour HH:mm format")
    .nullable(),
  notes: z.string().min(1).nullable(),
});

export type MeetingInfo = z.infer<typeof MeetingInfoSchema>;

const meetingInfoJsonSchema = {
  type: "object",
  properties: {
    name: nullableString(
      "Full name of the person speaking or being referred to, spelled as accurately as the transcript allows. Null if no name is stated.",
    ),
    meetingDate: nullableString(
      "Calendar date of the meeting as YYYY-MM-DD. Resolve relative dates using the supplied current date and timezone. Null if no date is stated.",
    ),
    meetingTime: nullableString(
      "Start time of the meeting as 24-hour HH:mm. Null if no time is stated.",
    ),
    notes: nullableString(
      "One or two sentences capturing the purpose or subject of the meeting, using only information present in the transcript. Null if nothing relevant is stated.",
    ),
  },
  required: ["name", "meetingDate", "meetingTime", "notes"],
  additionalProperties: false,
} as const satisfies StrictObjectJsonSchema;

function normalizeText(value: unknown): unknown {
  // An absent key carries the same meaning as an explicit null: nothing was
  // stated. Coercing here keeps the normaliser total, so a model that omits a
  // property produces a clean null rather than a validation failure.
  if (value === undefined) return null;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (NULL_LIKE_VALUES.has(trimmed.toLowerCase())) return null;

  return trimmed;
}

/** Pads `2026-9-20` to `2026-09-20`. Leaves anything else for Zod to reject. */
function normalizeDate(value: unknown): unknown {
  const text = normalizeText(value);
  if (typeof text !== "string") return text;

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return text;

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Pads `9:30` to `09:30` and drops a trailing `:ss`. */
function normalizeTime(value: unknown): unknown {
  const text = normalizeText(value);
  if (typeof text !== "string") return text;

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (!match) return text;

  const [, hours, minutes] = match;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

/**
 * Deterministic repair of formatting the model is allowed to get slightly
 * wrong. Also drops any property outside the schema, so unexpected keys can
 * never reach the client.
 */
export function normalizeMeetingInfo(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;

  const record = raw as Record<string, unknown>;

  return {
    name: normalizeText(record.name),
    meetingDate: normalizeDate(record.meetingDate),
    meetingTime: normalizeTime(record.meetingTime),
    notes: normalizeText(record.notes),
  };
}

export const meetingExtractionSchema = defineExtractionSchema<MeetingInfo>({
  name: "meeting_info",
  version: "1.0.0",
  zodSchema: MeetingInfoSchema,
  jsonSchema: meetingInfoJsonSchema,
  normalize: normalizeMeetingInfo,
  fieldGuidance: [
    "Fields to extract:",
    '- name: the person\'s name as stated. Preserve the spelling from the transcript; do not "correct" it to a more common name.',
    "- meetingDate: the meeting's calendar date, formatted YYYY-MM-DD.",
    "- meetingTime: the meeting's start time, formatted HH:mm on a 24-hour clock.",
    "- notes: a concise summary of the meeting's purpose, drawn only from the transcript.",
    "",
    "Return null for any field the transcript does not state.",
  ].join("\n"),
});
