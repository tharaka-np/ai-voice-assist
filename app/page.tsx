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
 *
 * The layout is an app shell rather than a document: fixed height, with the message
 * list as the only scrolling region. `dvh` rather than `vh` because mobile browser
 * chrome changes the viewport height, and `vh` would leave the composer under it.
 */
export default function Home() {
  const providerOptions = listTranscriptionProviderOptions();
  const defaultProviderId = getDefaultTranscriptionProviderId();

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-3 sm:px-4">
      <header className="shrink-0 pb-3 pt-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl dark:text-slate-50">
          AI Voice Information Extractor
        </h1>
        <p className="text-xs text-slate-600 sm:text-sm dark:text-slate-400">
          Speak to find a contact and schedule a meeting.
        </p>
      </header>

      <VoiceExtractor
        providerOptions={providerOptions}
        defaultProviderId={defaultProviderId}
      />
    </main>
  );
}
