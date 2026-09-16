import type { ContactSearchOutcome } from "@/lib/matching/contact-match";
import type { TranscriptionProviderId } from "@/lib/transcription/types";
import type {
  ConversationState,
  MeetingRequest,
} from "@/schemas/meeting-request";

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
  transcript: string;
  transcription: TranscriptionMeta;
  /**
   * Only what this turn stated. Returned alongside the merged state so the UI can
   * show what the latest sentence actually contributed, which is the difference
   * between "it ignored me" and "it already knew that".
   */
  latestTurn: MeetingRequest;
  /** Accumulated state after merging this turn into the previous one. */
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
  /** JSON-encoded accumulated state from previous turns. Optional on turn one. */
  state: "state",
} as const;

// ---------------------------------------------------------------------------
// POST /api/contacts/search  — rerun the search without speaking
// ---------------------------------------------------------------------------

/**
 * Used when the user edits the criteria directly, for example removing a chip the
 * extractor got wrong. Takes the state rather than a query string because the
 * search is over eight fields, not one.
 */
export type ContactSearchSuccess = {
  success: true;
  state: ConversationState;
  search: ContactSearchOutcome;
};

export type ContactSearchResponse = ContactSearchSuccess | ApiFailure;

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
