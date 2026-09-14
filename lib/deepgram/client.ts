import "server-only";

import { AppError } from "@/lib/errors";

/**
 * Deepgram configuration. Mirrors `lib/openai/client.ts` so both providers are
 * configured and guarded the same way.
 */

export const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";

export function isDeepgramConfigured(): boolean {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  return apiKey !== undefined && apiKey.trim().length > 0;
}

export function getDeepgramApiKey(): string {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new AppError({
      code: "configuration_error",
      status: 500,
      publicMessage:
        "Deepgram isn't configured on this server. Choose OpenAI, or ask the administrator to add a Deepgram key.",
      detail: "DEEPGRAM_API_KEY is missing or empty. Set it in .env.local.",
    });
  }

  return apiKey;
}

/**
 * Nova-3 is the default because it is the only Deepgram model that supports
 * keyterm prompting, which is the feature that matters for proper nouns.
 */
export function getDeepgramModel(): string {
  return process.env.DEEPGRAM_MODEL ?? "nova-3";
}
