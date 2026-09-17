"use client";

import { AudioPlayer } from "@/components/audio-player";
import { AudioRecorder } from "@/components/audio-recorder";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { UseAudioRecorderResult } from "@/hooks/use-audio-recorder";

type MicDockProps = {
  recorder: UseAudioRecorderResult;
  /** True while a turn is in flight; capture locks for the duration. */
  busy: boolean;
  /** False when the chosen engine has no key configured on the server. */
  canSubmit: boolean;
  submitLabel: string;
  processingLabel: string;
  onSubmit: () => void;
};

/**
 * Record, play back and submit — the one place any of that happens.
 *
 * Rendered exactly once, and positioned by breakpoint rather than duplicated: a
 * fixed bottom bar under `lg`, a normal block inside the sticky rail above it.
 * Same DOM node either way, which is the point. An earlier layout moved these
 * controls between two cards depending on the turn, and rendering them twice with
 * CSS to hide one would have meant two submit buttons and two live regions driving
 * a single `MediaRecorder`.
 *
 * Its own container classes rather than `Card`, because `cn` is a plain join with
 * no conflict resolution — overriding padding and rounding through it would depend
 * on stylesheet order.
 */
export function MicDock({
  recorder,
  busy,
  canSubmit,
  submitLabel,
  processingLabel,
  onSubmit,
}: MicDockProps) {
  return (
    <div
      className={
        "fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgb(15_23_42_/_0.06)] " +
        "lg:static lg:z-auto lg:rounded-2xl lg:border lg:px-5 lg:py-5 lg:shadow-sm " +
        "dark:border-slate-800 dark:bg-slate-900"
      }
    >
      {!recorder.isSupported ? (
        <div className="mb-3">
          <Alert tone="info" title="Recording isn't available in this browser">
            Your browser doesn&apos;t support the MediaRecorder API. Try the latest
            Chrome, Edge, Firefox or Safari.
          </Alert>
        </div>
      ) : null}

      <AudioRecorder
        status={recorder.status}
        isSupported={recorder.isSupported}
        duration={recorder.duration}
        maxDuration={recorder.maxDuration}
        hasClip={recorder.clip !== null}
        busy={busy}
        onStart={recorder.startRecording}
        onStop={recorder.stopRecording}
        onReset={recorder.resetRecording}
        onSelectFile={recorder.loadAudioFile}
      />

      {recorder.audioUrl !== null ? (
        <div className="mt-3 space-y-3">
          <AudioPlayer
            key={recorder.audioUrl}
            src={recorder.audioUrl}
            label={
              recorder.clip?.source === "upload"
                ? "Uploaded audio"
                : "Recorded audio"
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onSubmit} disabled={busy || !canSubmit}>
              {busy ? processingLabel : submitLabel}
            </Button>

            <span
              role="status"
              aria-live="polite"
              className="text-sm text-slate-500 dark:text-slate-400"
            >
              {busy ? processingLabel : null}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
