import { VoiceExtractor } from "@/components/voice-extractor";
import {
  getDefaultTranscriptionProviderId,
  listTranscriptionProviderOptions,
} from "@/lib/transcription/registry";

/**
 * Server Component. Renders the static shell and hands the interactive flow to
 * a single client boundary (`VoiceExtractor`), so nothing under `lib/openai/*`
 * or `lib/deepgram/*` can be pulled into the browser bundle.
 *
 * Provider availability is read here and passed down as plain data. That avoids
 * a config round-trip on load, and only ids, labels, model names and booleans
 * cross the boundary — never a key.
 */
export default function Home() {
  const providerOptions = listTranscriptionProviderOptions();
  const defaultProviderId = getDefaultTranscriptionProviderId();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-50">
          AI Voice Information Extractor
        </h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base dark:text-slate-400">
          Record your voice and automatically convert it into structured
          information.
        </p>
      </header>

      <VoiceExtractor
        providerOptions={providerOptions}
        defaultProviderId={defaultProviderId}
      />

      <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p>
          Try saying: &ldquo;My name is Tharaka. I want to schedule a meeting on
          September 20th, 2026 at 2 PM. The purpose of the meeting is to discuss
          the upcoming Spicr CRM release.&rdquo;
        </p>
        <p className="mt-2">
          Transcription runs on the engine you select; extraction always runs on
          OpenAI Structured Outputs. Audio is sent to the server for processing
          and is not stored. Anything the recording does not state comes back as{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
            null
          </code>{" "}
          rather than being guessed.
        </p>
      </footer>
    </main>
  );
}
