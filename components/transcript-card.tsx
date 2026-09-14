import { Card, CardTitle } from "@/components/ui/card";
import type { TranscriptionMeta } from "@/types/api";

/**
 * Shows the recognised text plus which engine produced it.
 *
 * The provider, model and latency are surfaced deliberately: comparing two
 * engines on the same recording is the point of the selector, and that is only
 * meaningful if the result says which one ran.
 */
export function TranscriptCard({
  transcript,
  transcription,
}: {
  transcript: string;
  transcription: TranscriptionMeta;
}) {
  return (
    <Card>
      <CardTitle hint={`${transcript.length} characters`}>Transcript</CardTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
          {transcription.label}
        </span>
        <code className="rounded bg-slate-100 px-1.5 py-1 font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {transcription.model}
        </code>
        <span className="text-slate-500 dark:text-slate-400">
          {(transcription.latencyMs / 1000).toFixed(1)}s
        </span>
        {transcription.keytermCount > 0 ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {transcription.keytermCount} boosted{" "}
            {transcription.keytermCount === 1 ? "name" : "names"}
          </span>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {transcript}
      </p>
    </Card>
  );
}
