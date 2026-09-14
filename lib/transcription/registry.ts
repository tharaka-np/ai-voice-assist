import "server-only";

import { deepgramTranscriptionProvider } from "@/lib/deepgram/transcribe";
import { AppError } from "@/lib/errors";
import { openAiTranscriptionProvider } from "@/lib/openai/transcribe";
import {
  TRANSCRIPTION_PROVIDER_IDS,
  TRANSCRIPTION_PROVIDER_META,
  isTranscriptionProviderId,
  type TranscriptionProvider,
  type TranscriptionProviderId,
  type TranscriptionProviderOption,
} from "@/lib/transcription/types";
import { getConfiguredKeyterms } from "@/lib/transcription/vocabulary";

/**
 * The single place providers are registered.
 *
 * Adding a third engine is one import plus one entry here. The route handler
 * resolves by id and never references a concrete provider, which is what makes
 * the choice switchable at request time rather than at deploy time.
 */
const PROVIDERS: Readonly<Record<TranscriptionProviderId, TranscriptionProvider>> = {
  openai: openAiTranscriptionProvider,
  deepgram: deepgramTranscriptionProvider,
};

/**
 * Resolves a provider, rejecting one whose credentials are absent. Failing here
 * keeps an unconfigured choice from turning into an opaque provider error.
 */
export function getTranscriptionProvider(
  id: TranscriptionProviderId,
): TranscriptionProvider {
  const provider = PROVIDERS[id];

  if (!provider.isConfigured()) {
    const { label } = TRANSCRIPTION_PROVIDER_META[id];

    throw new AppError({
      code: "configuration_error",
      status: 500,
      publicMessage: `${label} isn't configured on this server. Pick another transcription provider, or ask the administrator to add a ${label} API key.`,
      detail: `provider '${id}' selected but its credentials are absent`,
    });
  }

  return provider;
}

/** Server default, overridable per request by the UI. */
export function getDefaultTranscriptionProviderId(): TranscriptionProviderId {
  const configured = process.env.TRANSCRIPTION_PROVIDER;
  const preferred = isTranscriptionProviderId(configured) ? configured : "openai";

  if (PROVIDERS[preferred].isConfigured()) return preferred;

  // Fall back to whatever is actually usable, so a demo box with only one key
  // still opens on a working selection.
  return (
    TRANSCRIPTION_PROVIDER_IDS.find((id) => PROVIDERS[id].isConfigured()) ??
    preferred
  );
}

/**
 * Serialisable summary for the UI: ids, labels, resolved model names and
 * whether each is usable. Contains no credentials.
 */
export function listTranscriptionProviderOptions(): TranscriptionProviderOption[] {
  return TRANSCRIPTION_PROVIDER_IDS.map((id) => {
    const provider = PROVIDERS[id];

    return {
      id,
      label: TRANSCRIPTION_PROVIDER_META[id].label,
      description: TRANSCRIPTION_PROVIDER_META[id].description,
      model: provider.getModel(),
      available: provider.isConfigured(),
      // Only advertised where the adapter can actually act on it.
      keyterms: provider.supportsKeyterms ? getConfiguredKeyterms() : [],
    };
  });
}
