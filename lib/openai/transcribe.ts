import "server-only";

import { AppError } from "@/lib/errors";
import {
  getOpenAIClient,
  getTranscriptionModel,
  isOpenAiConfigured,
} from "@/lib/openai/client";
import { getTranscriptionLanguage } from "@/lib/transcription/language";
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
  const language = getTranscriptionLanguage();
  const startedAt = Date.now();

  let response;
  try {
    response = await client.audio.transcriptions.create({
      file,
      model,
      // Pins the language instead of letting the model detect one. This is the
      // fix for transcripts coming back in the wrong alphabet: with no language
      // set, a one-second clip carrying an unusual proper noun gave detection too
      // little to go on, and "Find Tharaka" came back as Urdu script. OpenAI also
      // documents a language hint as improving accuracy and latency.
      language,
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
    `[transcribe] provider=openai model=${model} lang=${language} ms=${latencyMs} bytes=${file.size} chars=${raw.trim().length}`,
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
