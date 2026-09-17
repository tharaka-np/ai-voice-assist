import "server-only";

import { baseMimeType } from "@/lib/audio/formats";
import {
  DEEPGRAM_LISTEN_URL,
  getDeepgramApiKey,
  getDeepgramModel,
  isDeepgramConfigured,
} from "@/lib/deepgram/client";
import { buildListenUrl } from "@/lib/deepgram/request";
import {
  extractDeepgramErrorMessage,
  extractDeepgramTranscript,
} from "@/lib/deepgram/response";
import { AppError } from "@/lib/errors";
import { getTranscriptionLanguage } from "@/lib/transcription/language";
import { finalizeTranscript } from "@/lib/transcription/transcript";
import type {
  TranscribeOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";
import { prepareKeyterms } from "@/lib/transcription/vocabulary";

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Deepgram pre-recorded transcription over plain `fetch`.
 *
 * The REST contract is small enough that the official SDK would add a
 * dependency without removing much code: POST the raw audio bytes with the
 * container in `Content-Type` and the API key in an `Authorization: Token`
 * header.
 *
 * Keyterm prompting biases recognition toward the supplied proper nouns. It is
 * a Nova-3 feature; on an older model the parameter is ignored rather than
 * rejected, which is why the model default lives in `client.ts` as `nova-3`.
 *
 * Reference: https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
 */
export async function transcribeWithDeepgram(
  file: File,
  options: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const apiKey = getDeepgramApiKey();
  const model = getDeepgramModel();

  // Re-normalised here rather than trusted: the caller may pass a raw list, and
  // a term containing a comma or a colon would silently boost nothing.
  const keyterms = prepareKeyterms(options.keyterms ?? []);
  const language = getTranscriptionLanguage();
  const url = buildListenUrl({
    baseUrl: DEEPGRAM_LISTEN_URL,
    model,
    keyterms,
    language,
  });

  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": baseMimeType(file.type) || "audio/webm",
      },
      body: await file.arrayBuffer(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AppError({
      code: "transcription_failed",
      status: 502,
      publicMessage:
        "We couldn't reach Deepgram to transcribe that recording. Please try again, or switch to OpenAI.",
      detail: `Deepgram request failed for model '${model}'`,
      cause: error,
    });
  }

  const latencyMs = Date.now() - startedAt;
  const rawBody = await response.text();

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AppError({
      code: "transcription_failed",
      status: 502,
      publicMessage:
        "Deepgram couldn't transcribe that recording. Please try again, or switch to OpenAI.",
      detail: `Deepgram returned ${response.status}: ${
        extractDeepgramErrorMessage(payload) ?? "no error message"
      }`,
    });
  }

  const transcript = extractDeepgramTranscript(payload);

  if (transcript === null) {
    throw new AppError({
      code: "transcription_failed",
      status: 502,
      publicMessage:
        "Deepgram returned a response we couldn't read. Please try again, or switch to OpenAI.",
      detail: "Deepgram response did not contain results.channels[0].alternatives[0].transcript",
    });
  }

  // Log shape and keyterm count, never the audio or the transcript text.
  console.info(
    `[transcribe] provider=deepgram model=${model} lang=${language} ms=${latencyMs} bytes=${file.size} chars=${transcript.trim().length} keyterms=${keyterms.length}`,
  );

  return finalizeTranscript({
    raw: transcript,
    providerId: "deepgram",
    model,
    latencyMs,
    keytermCount: keyterms.length,
  });
}

export const deepgramTranscriptionProvider: TranscriptionProvider = {
  id: "deepgram",
  getModel: getDeepgramModel,
  isConfigured: isDeepgramConfigured,
  supportsKeyterms: true,
  transcribe: transcribeWithDeepgram,
};
