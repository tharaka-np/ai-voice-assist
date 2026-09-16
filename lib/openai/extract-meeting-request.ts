import "server-only";

import {
  extractStructured,
  type ExtractionContext,
} from "@/lib/openai/extract-structured";
import {
  meetingRequestExtractionSchema,
  type MeetingRequest,
} from "@/schemas/meeting-request";

/**
 * Extracts the current state of a conversation into structured fields.
 *
 * Thin binding of the generic pipeline to one schema descriptor. The model
 * receives every transcript in the conversation and returns the merged result, so
 * the returned object is the complete picture rather than one turn's contribution.
 */
export function extractMeetingRequest(
  context: ExtractionContext,
): Promise<MeetingRequest> {
  return extractStructured(meetingRequestExtractionSchema, context);
}

export type { ExtractionContext };
