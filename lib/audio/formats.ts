/**
 * Audio format policy, shared by the browser recorder and the server-side
 * validator so the two can never drift apart.
 *
 * This module is intentionally free of server-only imports: it is safe to pull
 * into a client component.
 */

/** Hard ceiling on an upload. Roughly 20 minutes of Opus at 128 kbps. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** Anything smaller than this is a dropped or silent recording, not speech. */
export const MIN_AUDIO_BYTES = 1024;

/** Recording cap, enforced client-side with a visible countdown. */
export const MAX_RECORDING_SECONDS = 120;

/**
 * MIME types accepted by the API. Kept aligned with the container formats the
 * OpenAI transcription endpoint accepts, so a file that passes validation here
 * will not be rejected downstream.
 */
export const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/oga",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mpga",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
] as const;

/**
 * Candidate recording formats in preference order. Opus in WebM is the best
 * size/quality trade-off and is supported by Chrome, Edge and Firefox; Safari
 * and iOS Safari fall through to MP4/AAC.
 */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/mpeg",
] as const;

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "oga",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mpga": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

/** Strips codec and other parameters: `audio/webm;codecs=opus` -> `audio/webm`. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function isAcceptedAudioMimeType(mimeType: string): boolean {
  const base = baseMimeType(mimeType);
  return ACCEPTED_AUDIO_MIME_TYPES.some((accepted) => accepted === base);
}

/**
 * The OpenAI transcription endpoint infers the container from the filename, so
 * the upload needs an extension that matches the recorded MIME type.
 */
export function fileExtensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME_TYPE[baseMimeType(mimeType)] ?? "webm";
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}
