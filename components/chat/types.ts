import type { ContactSearchOutcome } from "@/lib/matching/contact-match";
import type { SavedMeeting, TranscriptionMeta } from "@/types/api";

/**
 * The chat transcript, as displayed.
 *
 * A presentation type, deliberately not in `types/api.ts` — nothing here crosses the
 * wire. It exists because the conversation state is *latest-only* by design: `state`
 * and `search` are replaced wholesale every turn, so there was previously nothing to
 * render a history from. This log is that history.
 *
 * The log is append-only and, apart from resolving one pending message, immutable.
 * Only the newest assistant entry is interactive; earlier ones render as frozen
 * summaries. That is a correctness rule rather than a visual one: acting on an older
 * result list would apply a choice against a list that has since changed, which is
 * the failure `resolveSelectionIntent` and `keepCarriedSelection` already exist to
 * prevent.
 */
export type ChatMessage =
  | UserMessage
  | AssistantSearchMessage
  | SubmittedMeetingMessage
  | SavedMeetingMessage
  | SystemMessage;

/**
 * One spoken turn.
 *
 * Appended the moment the request goes out, before the transcript exists, so the
 * send visibly registers. `transcript` is filled in when the response lands.
 */
export type UserMessage = {
  id: string;
  role: "user";
  /** Empty while `pending`. */
  transcript: string;
  transcription: TranscriptionMeta | null;
  /** The position this sentence chose, when it chose one. */
  selectedPosition: number | null;
  status: "pending" | "done";
};

/** The search the assistant came back with for that turn. */
export type AssistantSearchMessage = {
  id: string;
  role: "assistant";
  kind: "search";
  search: ContactSearchOutcome;
  selectedContactId: number | null;
  selectionWarning: string | null;
};

/** The meeting form, frozen read-only at the values that were actually written. */
export type SubmittedMeetingMessage = {
  id: string;
  role: "assistant";
  kind: "submitted";
  meeting: SavedMeeting;
};

/** The write confirmation that follows it. */
export type SavedMeetingMessage = {
  id: string;
  role: "assistant";
  kind: "saved";
  meeting: SavedMeeting;
};

/** A notice about the conversation itself rather than its contents. */
export type SystemMessage = {
  id: string;
  role: "system";
  text: string;
  tone: "warning" | "info";
};

/**
 * Ids only need to be unique within one session, and `crypto.randomUUID` is not
 * available on every target we claim to support. A counter would need a ref; this
 * needs nothing and collides only if two messages are appended in the same
 * millisecond with the same random suffix.
 */
export function newMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** True for the newest search message, which is the only interactive one. */
export function isLatestSearch(
  messages: readonly ChatMessage[],
  id: string,
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.kind === "search") {
      return message.id === id;
    }
  }

  return false;
}
