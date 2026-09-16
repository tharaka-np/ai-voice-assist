import type { ContactSearchOutcome } from "@/lib/matching/contact-match";
import type { TranscriptionProviderId } from "@/lib/transcription/types";
import type { ConversationState } from "@/schemas/meeting-request";

/**
 * Wire contracts for the API routes.
 *
 * Every response is a discriminated union on `success`, so the client narrows with
 * one check and cannot read data off a failed response.
 */

export type ApiFailure = {
  success: false;
  error: string;
};

/** Which engine produced the transcript, for side-by-side comparison. */
export type TranscriptionMeta = {
  provider: TranscriptionProviderId;
  label: string;
  model: string;
  latencyMs: number;
  /** Keyterms applied to this request. Zero when the engine has no such feature. */
  keytermCount: number;
};

// ---------------------------------------------------------------------------
// POST /api/process-audio  — one conversational turn
// ---------------------------------------------------------------------------

type TurnBase = {
  success: true;
  /** Just this turn's speech. Always returned, so the UI can echo it back. */
  transcript: string;
  /**
   * The conversation to send back next turn, already truncated.
   *
   * This is the only thing carried between turns — the extracted fields are
   * re-derived from it by the model, not accumulated by the client.
   *
   * Every turn joins it, including one that named a position, because the same
   * sentence may also carry criteria. Re-selection from a stale message is
   * prevented by the prompt rule that only the final message can be a selection,
   * and by verifying the chosen contact still matches.
   */
  transcripts: string[];
  transcription: TranscriptionMeta;
};

/**
 * One shape for every turn, because a turn is not one thing or the other.
 *
 * "Select the second one and schedule a meeting for her at 2pm" is a selection
 * *and* new meeting details. An earlier version modelled these as alternatives and
 * silently dropped the meeting details from exactly that sentence. Criteria are now
 * always extracted and always searched; a spoken position is an additional signal
 * applied on top.
 */
export type ProcessAudioSuccess = TurnBase & {
  /**
   * The model's complete merged view as of the latest message.
   *
   * Replaced wholesale. The client must not combine it with a previous value;
   * the merge already happened inside the model.
   */
  state: ConversationState;
  search: ContactSearchOutcome;
  /**
   * The contact to select, if any: either resolved from a spoken position, or the
   * lone remaining result auto-selected by the search.
   */
  selectedContactId: number | null;
  /** The position the user named, when they named one. For the confirmation line. */
  selectedPosition: number | null;
  /**
   * Set when a position was named but could not be honoured — out of range, or the
   * chosen contact no longer matches after this turn's criteria narrowed the list.
   *
   * A warning rather than an error: the criteria in the same sentence are still
   * valid and must not be thrown away with the bad position.
   */
  selectionWarning: string | null;
};

export type ProcessAudioResponse = ProcessAudioSuccess | ApiFailure;

/** Field names of the multipart request body. */
export const PROCESS_AUDIO_FIELDS = {
  audio: "audio",
  timezone: "timezone",
  currentDateTime: "currentDateTime",
  provider: "provider",
  /** JSON array of earlier transcripts, oldest first. Absent on turn one. */
  history: "history",
  /** JSON array of contact ids in the order currently displayed. */
  displayedContactIds: "displayedContactIds",
  /**
   * The contact already selected, so the choice survives turns that say nothing
   * about it. Omitted when nothing is selected.
   */
  selectedContactId: "selectedContactId",
} as const;

// ---------------------------------------------------------------------------
// POST /api/meetings
// ---------------------------------------------------------------------------

/** The saved meeting, echoed back so the UI can confirm what was written. */
export type SavedMeeting = {
  id: number;
  userId: number;
  userLabel: string;
  date: string;
  time: string;
  description: string;
  createdAt: string;
};

export type CreateMeetingSuccess = {
  success: true;
  meeting: SavedMeeting;
};

export type CreateMeetingResponse = CreateMeetingSuccess | ApiFailure;
