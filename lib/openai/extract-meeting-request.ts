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
 * Extracts one conversational turn into structured fields.
 *
 * Thin binding of the generic pipeline to one schema descriptor. The model sees
 * only the latest transcript — merging with earlier turns happens in
 * `mergeConversationState`, so extraction stays stateless and the accumulated
 * state stays deterministic.
 */
export function extractMeetingRequest(
  context: ExtractionContext,
): Promise<MeetingRequest> {
  return extractStructured(meetingRequestExtractionSchema, context);
}

export type { ExtractionContext };
