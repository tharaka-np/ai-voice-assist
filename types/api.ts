import type {
  ResolutionStatus,
  UserCandidate,
} from "@/lib/matching/name-match";
import type { TranscriptionProviderId } from "@/lib/transcription/types";
import type { MeetingInfo } from "@/schemas/meeting";

/**
 * Wire contracts for the API routes.
 *
 * Every response is a discriminated union on `success`, so the client narrows
 * with one check and cannot read data off a failed response.
 */

/** Which engine produced the transcript, for side-by-side comparison. */
export type TranscriptionMeta = {
  provider: TranscriptionProviderId;
  label: string;
  model: string;
  latencyMs: number;
  /** Keyterms applied to this request. Zero when the engine has no such feature. */
  keytermCount: number;
};

/** Ranked directory matches for the name heard in the recording. */
export type NameMatchMeta = {
  status: ResolutionStatus;
  /** Preselected user, or null whenever the choice belongs to the human. */
  selectedUserId: number | null;
  candidates: UserCandidate[];
  /** The name the extractor heard, echoed back for the "no match" message. */
  searchedFor: string | null;
};

// ---------------------------------------------------------------------------
// POST /api/process-audio
// ---------------------------------------------------------------------------

export type ProcessAudioSuccess = {
  success: true;
  transcript: string;
  transcription: TranscriptionMeta;
  data: MeetingInfo;
  nameMatch: NameMatchMeta;
};

export type ProcessAudioFailure = {
  success: false;
  error: string;
};

export type ProcessAudioResponse = ProcessAudioSuccess | ProcessAudioFailure;

/** Field names of the multipart request body. */
export const PROCESS_AUDIO_FIELDS = {
  audio: "audio",
  timezone: "timezone",
  currentDateTime: "currentDateTime",
  provider: "provider",
} as const;

// ---------------------------------------------------------------------------
// GET /api/users/search
// ---------------------------------------------------------------------------

export type UserSearchSuccess = {
  success: true;
  status: ResolutionStatus;
  selectedUserId: number | null;
  candidates: UserCandidate[];
};

export type UserSearchResponse = UserSearchSuccess | ProcessAudioFailure;

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

export type CreateMeetingResponse = CreateMeetingSuccess | ProcessAudioFailure;
