import "server-only";

import { resolveSelectionIntent } from "@/lib/matching/selection-cue";
import {
  extractStructured,
  type ExtractionContext,
} from "@/lib/openai/extract-structured";
import {
  conversationTurnExtractionSchema,
  type ConversationTurn,
} from "@/schemas/conversation-turn";

/**
 * Works out what one spoken turn was, and what the conversation now means.
 *
 * The model receives every transcript plus the numbered list on screen, and
 * answers two things at once: whether this sentence added search detail or chose a
 * result, and the merged criteria across the whole conversation.
 *
 * One call rather than two, because a separate classifier would double the latency
 * of every turn to disambiguate a minority of them.
 *
 * The returned intent is `"selection"` only when a selection is actionable — the
 * newest utterance named a position and there was a list to name it in. Callers can
 * trust the intent without re-checking, and `request` carries the merged criteria
 * either way. See `resolveSelectionIntent` for why that gate is code and not prompt.
 */
export async function interpretConversationTurn(
  context: ExtractionContext,
): Promise<ConversationTurn> {
  const turn = await extractStructured(
    conversationTurnExtractionSchema,
    context,
  );

  return resolveSelectionIntent(
    turn,
    context.transcripts.at(-1) ?? "",
    context.candidates?.length ?? 0,
  );
}

export type { ExtractionContext };
