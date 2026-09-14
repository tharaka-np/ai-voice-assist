import { AppError } from "@/lib/errors";
import type {
  TranscriptionProviderId,
  TranscriptionResult,
} from "@/lib/transcription/types";

/**
 * Shared post-processing so every provider fails identically on silence.
 *
 * Without this, "we heard nothing" would be a provider-specific behaviour and
 * the two adapters could drift apart in a way users would notice.
 */
export function finalizeTranscript({
  raw,
  providerId,
  model,
  latencyMs,
  keytermCount = 0,
}: {
  raw: string;
  providerId: TranscriptionProviderId;
  model: string;
  latencyMs: number;
  keytermCount?: number;
}): TranscriptionResult {
  const transcript = raw.trim();

  if (transcript.length === 0) {
    throw new AppError({
      code: "empty_transcript",
      status: 422,
      publicMessage:
        "We couldn't hear any speech in that recording. Please try again and speak clearly.",
      detail: `provider '${providerId}' (model '${model}') returned an empty transcript`,
    });
  }

  return { transcript, providerId, model, latencyMs, keytermCount };
}
