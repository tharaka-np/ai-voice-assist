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
    /*
     * Wider than the old `max-w-3xl` because the layout is now two panes. The
     * bottom padding clears the mobile capture dock, which is fixed to the viewport
     * below `lg` — without it the last element sits underneath the bar.
     */
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-52 pt-8 sm:px-6 lg:pb-14 lg:pt-12">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-50">
          AI Voice Information Extractor
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Record your voice and automatically convert it into structured
          information.
        </p>
      </header>

      <VoiceExtractor
        providerOptions={providerOptions}
        defaultProviderId={defaultProviderId}
      />

      {/*
        The spoken example moved into the first-run panel, where it is useful at the
        moment the user needs it. What is left is the standing technical note, folded
        away because it is read once.
      */}
      <footer className="mt-8 border-t border-slate-200 pt-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <details className="group">
          <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
            How this works, and what happens to your audio
          </summary>
          <p className="mt-2 max-w-3xl">
            Transcription runs on the engine you select; extraction always runs on
            OpenAI Structured Outputs. Audio is sent to the server for processing and
            is not stored. Anything the recording does not state comes back as{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
              null
            </code>{" "}
            rather than being guessed.
          </p>
        </details>
      </footer>
    </main>
  );
}
