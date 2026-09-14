import type { TranscriptionProviderId } from "@/lib/transcription/types";
import type { MeetingInfo } from "@/schemas/meeting";

/**
 * Wire contract for `POST /api/process-audio`.
 *
 * A discriminated union on `success` so the client narrows with one check and
 * cannot read `data` off a failed response.
 */

/** Which engine actually produced the transcript, for side-by-side comparison. */
export type TranscriptionMeta = {
  provider: TranscriptionProviderId;
  label: string;
  model: string;
  latencyMs: number;
  /** Keyterms applied to this request. Zero when the engine has no such feature. */
  keytermCount: number;
};

export type ProcessAudioSuccess = {
  success: true;
  transcript: string;
  transcription: TranscriptionMeta;
  data: MeetingInfo;
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
