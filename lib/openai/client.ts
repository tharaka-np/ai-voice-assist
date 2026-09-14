import "server-only";

import OpenAI from "openai";

import { AppError } from "@/lib/errors";

/**
 * Lazily constructed OpenAI client.
 *
 * The `server-only` import above is the enforcement mechanism for the "never
 * ship the API key to the browser" requirement: if any Client Component ever
 * imports this module, even transitively, the build fails instead of quietly
 * inlining a secret. Construction is lazy so a missing key surfaces as a
 * handled request error rather than a module-load crash at boot.
 */
let cachedClient: OpenAI | null = null;

export function isOpenAiConfigured(): boolean {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey !== undefined && apiKey.trim().length > 0;
}

export function getOpenAIClient(): OpenAI {
  if (cachedClient !== null) return cachedClient;

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new AppError({
      code: "configuration_error",
      status: 500,
      publicMessage:
        "The server isn't configured for audio processing yet. Please contact the administrator.",
      detail: "OPENAI_API_KEY is missing or empty. Set it in .env.local.",
    });
  }

  cachedClient = new OpenAI({
    apiKey,
    // Audio round-trips are slow; fail before the platform request timeout.
    timeout: 60_000,
    maxRetries: 2,
  });

  return cachedClient;
}

/** Model used for speech-to-text. Overridable per deployment. */
export function getTranscriptionModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe";
}

/**
 * Model used for structured extraction. Must be a model that supports
 * Structured Outputs with `strict: true`.
 */
export function getExtractionModel(): string {
  return process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1-mini";
}
