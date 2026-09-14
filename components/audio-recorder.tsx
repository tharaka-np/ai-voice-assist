"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { ACCEPTED_AUDIO_MIME_TYPES } from "@/lib/audio/formats";
import { formatDuration } from "@/lib/format";
import type { RecorderStatus } from "@/hooks/use-audio-recorder";

type AudioRecorderProps = {
  status: RecorderStatus;
  isSupported: boolean;
  duration: number;
  maxDuration: number;
  hasClip: boolean;
  /** True while extraction is in flight; capture controls lock during that. */
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onSelectFile: (file: File) => void;
};

/**
 * Capture controls. Presentational on purpose: all recorder state arrives via
 * props from `useAudioRecorder`, which keeps this component trivially testable
 * and lets the parent coordinate recording with the extraction request.
 */
export function AudioRecorder({
  status,
  isSupported,
  duration,
  // Still passed by the parent; uncomment with the countdown below.
  // maxDuration,
  hasClip,
  busy,
  onStart,
  onStop,
  onReset,
  onSelectFile,
}: AudioRecorderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isRecording = status === "recording";
  const isRequestingPermission = status === "requesting-permission";
  // Uncomment alongside the countdown in the recording indicator below.
  // const remainingSeconds = Math.max(0, maxDuration - duration);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {isRecording ? (
          <Button variant="danger" onClick={onStop}>
            Stop recording
          </Button>
        ) : (
          <Button
            onClick={onStart}
            disabled={!isSupported || isRequestingPermission || busy}
          >
            {isRequestingPermission
              ? "Waiting for microphone…"
              : hasClip
                ? "Record again"
                : "Start recording"}
          </Button>
        )}

        {hasClip && !isRecording ? (
          <Button variant="ghost" onClick={onReset} disabled={busy}>
            Reset
          </Button>
        ) : null}

        {/* <span className="hidden text-xs text-slate-400 sm:inline">or</span>

        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRecording || busy}
        >
          Upload audio file
        </Button> */}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_AUDIO_MIME_TYPES.join(",")}
          className="sr-only"
          aria-label="Upload an audio file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear the input so re-picking the same file still fires a change.
            event.target.value = "";
            if (file) onSelectFile(file);
          }}
        />
      </div>

      {/* Recording indicator. Conveys state through text and a timer, not colour alone. */}
      <div
        aria-live="polite"
        className="flex min-h-6 items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
      >
        {isRecording ? (
          <>
            <span
              aria-hidden="true"
              className="size-2.5 animate-pulse rounded-full bg-rose-500"
            />
            <span className="font-medium text-rose-600 dark:text-rose-400">
              Recording
            </span>
            <span className="font-mono tabular-nums">
              {formatDuration(duration)}
            </span>
            {/* <span className="text-xs text-slate-500 dark:text-slate-400">
              {remainingSeconds}s left of {formatDuration(maxDuration)} maximum
            </span> */}
          </>
        ) : null}

        {status === "ready" && !isRecording ? (
          <span>
            Recording ready
            {duration > 0 ? ` · ${formatDuration(duration)}` : null}. Play it
            back below, then extract.
          </span>
        ) : null}

        {status === "idle" && !hasClip ? (
          <span className="text-slate-500 dark:text-slate-400">
            Press record and describe your meeting.
          </span>
          // , or upload an existing file.
        ) : null}
      </div>
    </div>
  );
}
