"use client";

import { AudioPlayer } from "@/components/audio-player";
import { CloseIcon, MicIcon, SendIcon, StopIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { formatDuration } from "@/lib/format";
import type { UseAudioRecorderResult } from "@/hooks/use-audio-recorder";

type ComposerProps = {
  recorder: UseAudioRecorderResult;
  /** True while a turn is in flight; every control locks for the duration. */
  busy: boolean;
  /** False when the chosen engine has no key configured on the server. */
  canSubmit: boolean;
  onSubmit: () => void;
};

/**
 * The bottom bar: a text field, and one round button whose job changes with state.
 *
 * The field is decorative. This is a voice-only flow, and it exists because the
 * layout reads as a chat without it. It is `readOnly` and out of the tab order rather
 * than `disabled`, so it keeps normal styling while never taking focus or accepting a
 * keystroke — a focusable input that silently discards typing is worse than one that
 * cannot be reached.
 *
 * Three states, matching the recorder rather than inventing a new flow:
 *
 *   idle       [ Message… ]                     ( mic )
 *   recording  [ ● Recording 0:04 ]             ( stop )
 *   ready      [ ▶ playback ] [ discard ]       ( send )
 *
 * Press-and-hold, as WhatsApp uses, would need the recorder hook to expose different
 * lifecycle events. This keeps the existing start/stop behaviour and only changes what
 * it looks like.
 */
export function Composer({
  recorder,
  busy,
  canSubmit,
  onSubmit,
}: ComposerProps) {
  const isRecording = recorder.status === "recording";
  const isRequestingPermission = recorder.status === "requesting-permission";
  const hasClip = recorder.clip !== null;

  const placeholder = isRecording
    ? `Recording ${formatDuration(recorder.duration)}…`
    : hasClip
      ? "Ready to send — play it back, or send it"
      : isRequestingPermission
        ? "Waiting for microphone…"
        : "Voice only — tap the microphone to speak";

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
      {/* Playback for the pending clip only. Sent clips are not kept: the transcript
          is what the log shows, so holding every recording in memory would cost
          megabytes to reproduce something already written down. */}
      {recorder.audioUrl !== null ? (
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AudioPlayer
              key={recorder.audioUrl}
              src={recorder.audioUrl}
              label={
                recorder.clip?.source === "upload"
                  ? "Uploaded audio"
                  : "Recorded audio"
              }
            />
          </div>

          <IconButton
            tone="ghost"
            label="Discard this recording"
            onClick={recorder.resetRecording}
            disabled={busy}
          >
            <CloseIcon />
          </IconButton>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          {isRecording ? (
            <span
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 size-2 -translate-y-1/2 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none"
            />
          ) : null}

          <input
            type="text"
            readOnly
            tabIndex={-1}
            value=""
            placeholder={placeholder}
            aria-label="Text entry is not available. Use the microphone button to speak."
            className={`w-full rounded-full border border-slate-300 bg-slate-50 py-3 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400 ${
              isRecording ? "pl-8" : "pl-4"
            }`}
          />
        </div>

        {isRecording ? (
          <IconButton
            tone="danger"
            label="Stop recording"
            onClick={recorder.stopRecording}
          >
            <StopIcon />
          </IconButton>
        ) : hasClip ? (
          <IconButton
            tone="primary"
            label="Send this recording"
            onClick={onSubmit}
            disabled={busy || !canSubmit}
          >
            <SendIcon />
          </IconButton>
        ) : (
          <IconButton
            tone="primary"
            label="Start recording"
            onClick={recorder.startRecording}
            disabled={!recorder.isSupported || isRequestingPermission || busy}
          >
            <MicIcon />
          </IconButton>
        )}
      </div>

      {/* The single live region for capture state. The typing indicator in the log is
          decorative for exactly this reason — one announcement, not two. */}
      <p
        role="status"
        aria-live="polite"
        className="mt-1.5 min-h-4 px-2 text-xs text-slate-500 dark:text-slate-400"
      >
        {busy
          ? "Transcribing and extracting…"
          : isRecording
            ? `Recording ${formatDuration(recorder.duration)}`
            : null}
      </p>
    </div>
  );
}
