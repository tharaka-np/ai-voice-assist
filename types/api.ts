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

export type ProcessAudioSuccess = {
  success: true;
  /** Just this turn's speech. */
  transcript: string;
  /**
   * The whole conversation, already truncated, for the client to send back next
   * turn. This is the only thing carried between turns — the extracted fields are
   * re-derived from it by the model, not accumulated by the client.
   */
  transcripts: string[];
  transcription: TranscriptionMeta;
  /**
   * The model's complete merged view as of the latest message.
   *
   * Replaced wholesale on every turn. The client must not combine this with a
   * previous value; the merge already happened inside the model.
   */
  state: ConversationState;
  search: ContactSearchOutcome;
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
