import { z } from "zod";

import {
  ACCEPTED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
  baseMimeType,
  formatMegabytes,
  isAcceptedAudioMimeType,
} from "@/lib/audio/formats";
import { AppError } from "@/lib/errors";
import {
  TRANSCRIPTION_PROVIDER_IDS,
  isTranscriptionProviderId,
  type TranscriptionProviderId,
} from "@/lib/transcription/types";


export type ValidatedAudioRequest = {
  audio: File;
  timezone: string;
  currentDateTime: string;
  /** Null means "use the server default". */
  providerId: TranscriptionProviderId | null;
  /** Transcripts of earlier turns, oldest first. Empty on the first turn. */
  history: string[];
};

/** Guards against a client sending an unbounded transcript array. */
const MAX_HISTORY_ENTRIES = 100;
const MAX_TRANSCRIPT_LENGTH = 5_000;

const HistorySchema = z.array(
  z.string().max(MAX_TRANSCRIPT_LENGTH, "a transcript was unreasonably long"),
);

/**
 * Parses the conversation history the client echoes back each turn.
 *
 * This is the only thing carried between turns now: the extracted fields are not
 * sent back, because the model re-derives them from the whole conversation.
 *
 * Absent means "first turn". Malformed is rejected rather than silently reset —
 * the client only ever sends history it received from this API, so a parse failure
 * is a bug worth surfacing, and a 400 leaves the browser's copy intact for a retry.
 */
export function readTranscriptHistory(formData: FormData): string[] {
  const raw = formData.get("history");

  if (raw === null || raw === "") return [];

  if (typeof raw !== "string") {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage: "That request wasn't readable. Please try again.",
      detail: "form field 'history' was not a string",
    });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage: "That request wasn't readable. Please try again.",
      detail: "form field 'history' was not valid JSON",
      cause: error,
    });
  }

  const parsed = HistorySchema.safeParse(decoded);

  if (!parsed.success) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage:
        "We lost track of the conversation. Please start over and try again.",
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "history"}(${issue.code})`)
        .join(", "),
    });
  }

  if (parsed.data.length > MAX_HISTORY_ENTRIES) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage:
        "This conversation has gone on too long. Please start a new search.",
      detail: `history had ${parsed.data.length} entries, limit ${MAX_HISTORY_ENTRIES}`,
    });
  }

  return parsed.data;
}

const MetadataSchema = z.object({
  timezone: z
    .string()
    .min(1, "timezone is required")
    .max(100, "timezone is not a valid IANA identifier"),
  currentDateTime: z
    .string()
    .min(1, "currentDateTime is required")
    .max(64, "currentDateTime is not a valid ISO 8601 timestamp"),
});

/** Confirms the string is an IANA zone the runtime actually knows about. */
export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function isValidIsoDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * The provider field is optional so the API stays usable without it, but an
 * unrecognised value is rejected rather than silently falling back — a typo
 * should not quietly bill a different vendor than the caller intended.
 */
export function readTranscriptionProviderId(
  formData: FormData,
): TranscriptionProviderId | null {
  const raw = formData.get("provider");

  if (raw === null || raw === "") return null;

  if (!isTranscriptionProviderId(raw)) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage:
        "That transcription provider isn't recognised. Please reload and try again.",
      detail: `provider must be one of ${TRANSCRIPTION_PROVIDER_IDS.join(", ")}`,
    });
  }

  return raw;
}

function readAudioFile(formData: FormData): File {
  const audio = formData.get("audio");

  if (audio === null) {
    throw new AppError({
      code: "audio_missing",
      status: 400,
      publicMessage: "No audio was received. Please record again.",
      detail: "form field 'audio' was absent",
    });
  }

  if (!(audio instanceof File)) {
    throw new AppError({
      code: "audio_missing",
      status: 400,
      publicMessage: "No audio was received. Please record again.",
      detail: "form field 'audio' was not a file",
    });
  }

  if (audio.size < MIN_AUDIO_BYTES) {
    throw new AppError({
      code: "audio_empty",
      status: 400,
      publicMessage:
        "That recording was too short to process. Please record again and speak for a few seconds.",
      detail: `audio size ${audio.size} bytes is below the ${MIN_AUDIO_BYTES} byte floor`,
    });
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    throw new AppError({
      code: "audio_too_large",
      status: 413,
      publicMessage: `That audio file is too large. The limit is ${formatMegabytes(MAX_AUDIO_BYTES)}.`,
      detail: `audio size ${audio.size} bytes exceeds the ${MAX_AUDIO_BYTES} byte ceiling`,
    });
  }

  if (!isAcceptedAudioMimeType(audio.type)) {
    throw new AppError({
      code: "audio_unsupported_type",
      status: 415,
      publicMessage:
        "That audio format isn't supported. Try recording again, or upload a WebM, MP4, MP3, WAV or OGG file.",
      detail: `received type '${baseMimeType(audio.type)}', expected one of ${ACCEPTED_AUDIO_MIME_TYPES.join(", ")}`,
    });
  }

  return audio;
}

/**
 * Validates the multipart payload of `POST /api/process-audio`.
 *
 * `timezone` and `currentDateTime` are required rather than defaulted: relative
 * date resolution silently produces wrong answers if the server guesses, so a
 * client that forgets to send them should get a loud error.
 */
export function validateProcessAudioForm(
  formData: FormData,
): ValidatedAudioRequest {
  const audio = readAudioFile(formData);

  const metadata = MetadataSchema.safeParse({
    timezone: formData.get("timezone"),
    currentDateTime: formData.get("currentDateTime"),
  });

  if (!metadata.success) {
    const summary = metadata.error.issues
      .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
      .join("; ");

    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage: "The request was missing required information. Please reload and try again.",
      detail: summary,
    });
  }

  const { timezone, currentDateTime } = metadata.data;

  if (!isValidTimeZone(timezone)) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage: "Your browser sent an unrecognised timezone. Please reload and try again.",
      detail: `unknown IANA timezone '${timezone}'`,
    });
  }

  if (!isValidIsoDateTime(currentDateTime)) {
    throw new AppError({
      code: "invalid_metadata",
      status: 400,
      publicMessage: "Your browser sent an invalid timestamp. Please reload and try again.",
      detail: `unparseable currentDateTime '${currentDateTime}'`,
    });
  }

  return {
    audio,
    timezone,
    currentDateTime,
    providerId: readTranscriptionProviderId(formData),
    history: readTranscriptHistory(formData),
  };
}
