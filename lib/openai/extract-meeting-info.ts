import "server-only";

import { extractStructured, type ExtractionContext } from "@/lib/openai/extract-structured";
import { meetingExtractionSchema, type MeetingInfo } from "@/schemas/meeting";

/**
 * Extracts meeting details from a transcript.
 *
 * Thin binding of the generic pipeline to one schema descriptor. To move to a
 * richer shape later, add a new descriptor under `schemas/` and point this at
 * it; nothing in the pipeline or the route handler needs to change.
 */
export function extractMeetingInfo(
  context: ExtractionContext,
): Promise<MeetingInfo> {
  return extractStructured(meetingExtractionSchema, context);
}

export type { ExtractionContext };
