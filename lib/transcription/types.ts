/**
 * Provider-neutral transcription contract.
 *
 * Deliberately free of server-only imports so Client Components can share the
 * ids, labels and result types without pulling provider code into the browser
 * bundle. The implementations live in `lib/openai/` and `lib/deepgram/`, and
 * `lib/transcription/registry.ts` wires them up.
 */

export const TRANSCRIPTION_PROVIDER_IDS = ["openai", "deepgram"] as const;

export type TranscriptionProviderId = (typeof TRANSCRIPTION_PROVIDER_IDS)[number];

export function isTranscriptionProviderId(
  value: unknown,
): value is TranscriptionProviderId {
  return (
    typeof value === "string" &&
    TRANSCRIPTION_PROVIDER_IDS.some((id) => id === value)
  );
}

/**
 * What every provider returns. `model` and `latencyMs` are reported back to the
 * client so a benchmark run can compare providers on the same recording.
 */
export type TranscriptionResult = {
  transcript: string;
  providerId: TranscriptionProviderId;
  model: string;
  latencyMs: number;
  /** How many keyterms were actually applied. Zero when unsupported or unset. */
  keytermCount: number;
};

/**
 * Per-request hints. Support varies by provider, so an adapter that cannot use
 * an option ignores it rather than failing.
 */
export type TranscribeOptions = {
  /**
   * Proper nouns to bias recognition toward: people, companies, product names.
   * Used by Deepgram's keyterm prompting. Ignored by adapters without an
   * equivalent feature.
   */
  keyterms?: readonly string[];
};

/**
 * The adapter interface. Adding a third provider means implementing this and
 * adding one entry to the registry; nothing else changes.
 */
export type TranscriptionProvider = {
  readonly id: TranscriptionProviderId;
  /** Resolved from configuration at call time, not frozen at import. */
  getModel(): string;
  /** False when the provider's credentials are absent from the environment. */
  isConfigured(): boolean;
  /** True when the adapter can act on `keyterms`. Drives what the UI advertises. */
  readonly supportsKeyterms: boolean;
  transcribe(file: File, options?: TranscribeOptions): Promise<TranscriptionResult>;
};

/** Display metadata. Lives here so the UI and the server agree on naming. */
export const TRANSCRIPTION_PROVIDER_META: Readonly<
  Record<TranscriptionProviderId, { label: string; description: string }>
> = {
  openai: {
    label: "OpenAI",
    description: "Strong general-purpose accuracy and punctuation.",
  },
  deepgram: {
    label: "Deepgram",
    description: "Fast, and biased toward the names listed below.",
  },
};

/** Serialisable provider summary sent from the server to the UI. No secrets. */
export type TranscriptionProviderOption = {
  id: TranscriptionProviderId;
  label: string;
  description: string;
  model: string;
  /** When false the UI disables the choice instead of hiding it. */
  available: boolean;
  /** Names this engine will be biased toward. Empty when unsupported. */
  keyterms: string[];
};
