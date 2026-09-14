import "server-only";

import { AppError } from "@/lib/errors";
import {
  getOpenAIClient,
  getTranscriptionModel,
  isOpenAiConfigured,
} from "@/lib/openai/client";
import { finalizeTranscript } from "@/lib/transcription/transcript";
import type {
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";

/**
 * OpenAI speech-to-text.
 *
 * Knows nothing about HTTP: it takes a `File` and returns a transcript, so the
 * route handler stays a thin orchestration layer and this can be reused from a
 * queue worker or a server action later.
 *
 * Takes no `TranscribeOptions`: a narrower function still satisfies the wider
 * adapter interface, so there is no need for an unused parameter. `keyterms` are
 * not supported here because the OpenAI transcription endpoint takes free-text
 * context through a `prompt` parameter rather than a term list, which is a
 * separate change. `supportsKeyterms` is false accordingly, so the UI does not
 * advertise a feature that is not running — which keeps a provider comparison
 * honest about what was actually enabled on each side.
 */
export async function transcribeAudio(file: File): Promise<TranscriptionResult> {
  const client = getOpenAIClient();
  const model = getTranscriptionModel();
  const startedAt = Date.now();

  let response;
  try {
    response = await client.audio.transcriptions.create({
      file,
      model,
      response_format: "json",
    });
  } catch (error) {
    throw new AppError({
      code: "transcription_failed",
      status: 502,
      publicMessage:
        "We couldn't transcribe that recording with OpenAI. Please try again, or switch to Deepgram.",
      detail: `transcription request failed for model '${model}'`,
      cause: error,
    });
  }

  const latencyMs = Date.now() - startedAt;
  const raw = (typeof response === "string" ? response : response.text) ?? "";

  // Log shape, not content: transcripts can contain personal information.
  console.info(
    `[transcribe] provider=openai model=${model} ms=${latencyMs} bytes=${file.size} chars=${raw.trim().length}`,
  );

  return finalizeTranscript({ raw, providerId: "openai", model, latencyMs });
}

export const openAiTranscriptionProvider: TranscriptionProvider = {
  id: "openai",
  getModel: getTranscriptionModel,
  isConfigured: isOpenAiConfigured,
  supportsKeyterms: false,
  transcribe: transcribeAudio,
};
