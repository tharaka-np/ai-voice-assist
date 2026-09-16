import { z } from "zod";

import {
  defineExtractionSchema,
  describedInteger,
  enumString,
  nestedObject,
  type StrictObjectJsonSchema,
} from "./extraction-schema";
import {
  meetingRequestExtractionSchema,
  meetingRequestJsonSchema,
  meetingRequestSchema,
  normalizeMeetingRequest,
} from "./meeting-request";

/**
 * What one spoken turn turned out to be.
 *
 * A turn is either more search detail, or a choice between results already on
 * screen. Both come from the same model call: the model sees the conversation and
 * the numbered list, and tells us which kind of sentence it just heard.
 */

export const TURN_INTENTS = ["criteria", "selection"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

/** Zero means "not a selection". Bounded so a wild value cannot index anything. */
export const NO_POSITION = 0;
const MAX_POSITION = 50;

export const conversationTurnSchema = z.object({
  intent: z.enum(TURN_INTENTS).default("criteria"),
  /**
   * 1-based position in the list shown to the user, or 0 when this turn is not a
   * selection.
   *
   * A position, never a record id. The application maps it back to a contact,
   * which is what keeps the model away from database identifiers — the one
   * boundary that has held through every change to this pipeline.
   */
  position: z.number().int().min(NO_POSITION).max(MAX_POSITION).default(NO_POSITION),
  /** Ignored entirely when `intent` is `"selection"`. */
  request: meetingRequestSchema,
});

export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

const conversationTurnJsonSchema = {
  type: "object",
  properties: {
    intent: enumString(
      'Set to "selection" only when the latest user message chooses one of the numbered results. Otherwise "criteria".',
      TURN_INTENTS,
    ),
    position: describedInteger(
      "The 1-based number of the chosen result when intent is selection. Use 0 when intent is criteria, or when a selection cannot be resolved to exactly one number.",
    ),
    request: nestedObject(
      "The full search criteria merged across the whole conversation. Always fill this in as normal; it is ignored when intent is selection.",
      meetingRequestJsonSchema,
    ),
  },
  required: ["intent", "position", "request"],
  additionalProperties: false,
} as const satisfies StrictObjectJsonSchema;

/**
 * Deterministic cleanup before Zod validation.
 *
 * Anything other than a literal "selection" collapses to "criteria", and a
 * non-integer position collapses to zero. Both defaults fail *safe*: the turn is
 * treated as search detail, which is recoverable, rather than as a selection,
 * which would silently pick a person.
 */
export function normalizeConversationTurn(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;

  const record = raw as Record<string, unknown>;
  const position =
    typeof record.position === "number" && Number.isFinite(record.position)
      ? Math.trunc(record.position)
      : NO_POSITION;

  return {
    intent: record.intent === "selection" ? "selection" : "criteria",
    position: position < NO_POSITION ? NO_POSITION : position,
    request: normalizeMeetingRequest(record.request),
  };
}

export const conversationTurnExtractionSchema =
  defineExtractionSchema<ConversationTurn>({
    name: "conversation_turn",
    // 3.x: the flat request gained an intent wrapper so a turn can also be a
    // choice between displayed results.
    version: "3.0.0",
    zodSchema: conversationTurnSchema,
    jsonSchema: conversationTurnJsonSchema,
    normalize: normalizeConversationTurn,
    // The conversation-merging rules are unchanged and reused verbatim. The
    // selection rules are appended by `buildExtractionMessages`, and only when
    // there is actually a list to choose from.
    fieldGuidance: meetingRequestExtractionSchema.fieldGuidance,
  });
