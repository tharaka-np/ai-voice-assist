import { z } from "zod";

import {
  defineExtractionSchema,
  describedString,
  enumString,
  type StrictObjectJsonSchema,
} from "./extraction-schema";
import {
  HH_MM_PATTERN,
  ISO_DATE_PATTERN,
  isRealCalendarDate,
  normalizeDateValue,
  normalizeEmailValue,
  normalizeOptionalText,
  normalizePhoneValue,
  normalizeTimeValue,
} from "./patterns";

/**
 * The accumulated state of one conversational search.
 *
 * Every field is a string and "not stated" is the empty string, never null or
 * undefined. That single convention is what makes the merge rules work: an empty
 * incoming value can never overwrite something the user already told us, and a
 * non-empty one always can.
 */

// ---------------------------------------------------------------------------
// Field groups
//
// Kept as data rather than duplicated across the UI, the search and the tests.
// The distinction matters: contact fields narrow the directory search, meeting
// fields describe what to schedule and must never filter contacts.
// ---------------------------------------------------------------------------

export const CONTACT_FIELDS = [
  "fname",
  "lname",
  "city",
  "phoneNumber",
  "email",
  "street",
  "state",
  "gender",
] as const;

export const MEETING_FIELDS = ["meetingDate", "meetingTime", "notes"] as const;

export type ContactField = (typeof CONTACT_FIELDS)[number];
export type MeetingField = (typeof MEETING_FIELDS)[number];

export const GENDER_VALUES = ["male", "female"] as const;

/** Human labels for the criteria chips, so the UI never invents its own. */
export const FIELD_LABELS: Readonly<Record<ContactField | MeetingField, string>> =
  {
    fname: "First name",
    lname: "Last name",
    city: "City",
    phoneNumber: "Phone",
    email: "Email",
    street: "Street",
    state: "State",
    gender: "Gender",
    meetingDate: "Date",
    meetingTime: "Time",
    notes: "Notes",
  };

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Allows an empty string, or a value passing `check`.
 *
 * The spec's schema is a plain string, but keeping the format assertions means a
 * model that ignores the normalisation instruction fails loudly instead of
 * writing "next Friday" into a date field and silently matching nothing.
 */
function emptyOr(check: (value: string) => boolean, message: string) {
  return z
    .string()
    .refine((value) => value === "" || check(value), message)
    .default("");
}

export const meetingRequestSchema = z.object({
  fname: z.string().default(""),
  lname: z.string().default(""),
  meetingDate: emptyOr(
    (value) => ISO_DATE_PATTERN.test(value) && isRealCalendarDate(value),
    "meetingDate must be empty or a real date in YYYY-MM-DD format",
  ),
  meetingTime: emptyOr(
    (value) => HH_MM_PATTERN.test(value),
    "meetingTime must be empty or a 24-hour time in HH:mm format",
  ),
  notes: z.string().default(""),
  city: z.string().default(""),
  phoneNumber: z.string().default(""),
  email: z.string().default(""),
  street: z.string().default(""),
  state: z.string().default(""),
  // `""` is part of the enum rather than a union, which keeps the inferred type
  // as the exact `"" | "male" | "female"` the conversation state declares.
  gender: z.enum(["", ...GENDER_VALUES]).default(""),
});

export type MeetingRequest = z.infer<typeof meetingRequestSchema>;

/** The conversation state is exactly one accumulated request. */
export type ConversationState = MeetingRequest;

export const emptyMeetingRequest: MeetingRequest = {
  fname: "",
  lname: "",
  meetingDate: "",
  meetingTime: "",
  notes: "",
  city: "",
  phoneNumber: "",
  email: "",
  street: "",
  state: "",
  gender: "",
};

/** Alias matching the spec's naming, for readability at call sites. */
export const initialConversationState: ConversationState = emptyMeetingRequest;

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Folds one turn's extraction into the accumulated state.
 *
 * Two rules, and only two:
 *   1. An empty incoming value leaves the previous value alone.
 *   2. A non-empty incoming value replaces the previous value.
 *
 * Written field by field on purpose. A loop over the key list would need casts to
 * satisfy the narrower `gender` type, and this is the one function whose
 * behaviour the whole conversational flow depends on — being able to read it
 * without following generics is worth the repetition.
 *
 * Deliberately *not* delegated to the model. The LLM sees only the latest
 * transcript, so it cannot drop or invent a value it was never shown, and the
 * accumulated state stays deterministic.
 */
export function mergeConversationState(
  previous: ConversationState,
  incoming: ConversationState,
): ConversationState {
  return {
    fname: incoming.fname || previous.fname,
    lname: incoming.lname || previous.lname,
    meetingDate: incoming.meetingDate || previous.meetingDate,
    meetingTime: incoming.meetingTime || previous.meetingTime,
    notes: incoming.notes || previous.notes,
    city: incoming.city || previous.city,
    phoneNumber: incoming.phoneNumber || previous.phoneNumber,
    email: incoming.email || previous.email,
    street: incoming.street || previous.street,
    state: incoming.state || previous.state,
    gender: incoming.gender || previous.gender,
  };
}

/** Clears one field, used by the removable criteria chips. */
export function clearField(
  state: ConversationState,
  field: ContactField | MeetingField,
): ConversationState {
  return { ...state, [field]: "" };
}

/** Contact fields the user has actually supplied, in display order. */
export function populatedContactFields(
  state: ConversationState,
): ContactField[] {
  return CONTACT_FIELDS.filter((field) => state[field] !== "");
}

/** Meeting fields the user has actually supplied, in display order. */
export function populatedMeetingFields(
  state: ConversationState,
): MeetingField[] {
  return MEETING_FIELDS.filter((field) => state[field] !== "");
}

/** True when there is at least one contact filter to search on. */
export function hasContactCriteria(state: ConversationState): boolean {
  return populatedContactFields(state).length > 0;
}

// ---------------------------------------------------------------------------
// Normalisation of raw model output
// ---------------------------------------------------------------------------

/**
 * Deterministic cleanup applied before Zod validation.
 *
 * Repairs formatting the model is allowed to get slightly wrong, collapses
 * placeholder words like "unknown" to empty, and drops any property outside the
 * schema. It never invents a value.
 */
export function normalizeMeetingRequest(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;

  const record = raw as Record<string, unknown>;
  const gender = normalizeOptionalText(record.gender).toLowerCase();

  return {
    fname: normalizeOptionalText(record.fname),
    lname: normalizeOptionalText(record.lname),
    meetingDate: normalizeDateValue(record.meetingDate),
    meetingTime: normalizeTimeValue(record.meetingTime),
    notes: normalizeOptionalText(record.notes),
    city: normalizeOptionalText(record.city),
    // Digits only: the directory stores "+1 (512) 555-0101" while speech
    // produces "5125550101", and only digits compare reliably.
    phoneNumber: normalizePhoneValue(record.phoneNumber),
    email: normalizeEmailValue(record.email),
    street: normalizeOptionalText(record.street),
    state: normalizeOptionalText(record.state),
    // Anything other than the two permitted values becomes empty rather than a
    // validation failure, so an unexpected word cannot break the whole turn.
    gender: GENDER_VALUES.some((value) => value === gender) ? gender : "",
  };
}

// ---------------------------------------------------------------------------
// OpenAI Structured Outputs descriptor
// ---------------------------------------------------------------------------

const meetingRequestJsonSchema = {
  type: "object",
  properties: {
    fname: describedString(
      'First name only, exactly as stated. Empty string if not stated. From "Eric Poe" this is "Eric".',
    ),
    lname: describedString(
      'Last name only, exactly as stated. Empty string if not stated. From "Eric Poe" this is "Poe".',
    ),
    meetingDate: describedString(
      "Meeting date as YYYY-MM-DD. Resolve relative dates against the supplied current date and timezone. Empty string if not stated.",
    ),
    meetingTime: describedString(
      "Meeting start time as 24-hour HH:mm. Empty string if not stated.",
    ),
    notes: describedString(
      "Purpose or subject of the meeting, drawn only from this message. Empty string if not stated.",
    ),
    city: describedString(
      "City the person lives or works in. Empty string if not stated.",
    ),
    phoneNumber: describedString(
      "Phone number, digits only, no spaces or punctuation. Empty string if not stated.",
    ),
    email: describedString(
      "Email address, lowercase. Empty string if not stated.",
    ),
    street: describedString(
      "Street address. Empty string if not stated.",
    ),
    state: describedString(
      "State, province or region. Empty string if not stated.",
    ),
    gender: enumString(
      'Only when the speaker states it explicitly, for example "the male user" or "she is female". Never infer it from a first name. Empty string otherwise.',
      ["", ...GENDER_VALUES],
    ),
  },
  required: [...CONTACT_FIELDS, ...MEETING_FIELDS],
  additionalProperties: false,
} as const satisfies StrictObjectJsonSchema;

export const meetingRequestExtractionSchema =
  defineExtractionSchema<MeetingRequest>({
    name: "meeting_request",
    // 2.x: `name` split into fname/lname, contact fields added, and the absent
    // marker changed from null to the empty string.
    version: "2.0.0",
    zodSchema: meetingRequestSchema,
    jsonSchema: meetingRequestJsonSchema,
    normalize: normalizeMeetingRequest,
    fieldGuidance: [
      "This transcript is ONE TURN in an ongoing conversation.",
      "",
      "Extract only what is stated in this message. Return an empty string for",
      "everything else. Do not reuse values from earlier turns, do not guess, and",
      "do not infer contact details. The application merges your output with what",
      "it already knows, so omitting a value is safe and inventing one is not.",
      "",
      "Fields to extract:",
      "- fname: first name only, as stated. Preserve the spelling; do not correct",
      "  it to a more common name.",
      "- lname: last name only. Empty if the speaker gave only a first name.",
      "- city, street, state: location details, only if stated.",
      "- phoneNumber: digits only.",
      "- email: lowercase.",
      '- gender: "male" or "female" only when stated outright. Never infer it from',
      "  a first name.",
      "- meetingDate: YYYY-MM-DD.",
      "- meetingTime: HH:mm, 24-hour.",
      "- notes: the meeting's purpose.",
      "",
      'Example: "Actually find Eric Poe, his email is eric.poe@example.com" yields',
      'fname "Eric", lname "Poe", email "eric.poe@example.com", and empty strings',
      "for every other field, including the meeting details, because this message",
      "does not restate them.",
    ].join("\n"),
  });
