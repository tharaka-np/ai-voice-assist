"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  MAX_AUDIO_BYTES,
  MAX_RECORDING_SECONDS,
  MIN_AUDIO_BYTES,
  RECORDER_MIME_CANDIDATES,
  fileExtensionForMimeType,
  formatMegabytes,
  isAcceptedAudioMimeType,
} from "@/lib/audio/formats";

export type RecorderStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "ready";

export type AudioClip = {
  blob: Blob;
  /** Object URL for playback. Owned and revoked by this hook. */
  url: string;
  mimeType: string;
  /** Filename sent to the API; the extension tells the provider the container. */
  fileName: string;
  /** Measured for recordings, 0 for uploads (the player reports the real value). */
  durationSeconds: number;
  source: "recording" | "upload";
};

export type UseAudioRecorderResult = {
  status: RecorderStatus;
  isRecording: boolean;
  /** False when the browser has no MediaRecorder or getUserMedia. */
  isSupported: boolean;
  /** True once the user has actively blocked the microphone. */
  isPermissionDenied: boolean;
  /** Elapsed seconds while recording, frozen at the final length afterwards. */
  duration: number;
  maxDuration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  clip: AudioClip | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  loadAudioFile: (file: File) => void;
};

/**
 * Picks the best container the browser will actually record.
 *
 * Chrome, Edge and Firefox land on Opus in WebM. Safari and iOS Safari fall
 * through to MP4/AAC. Returning `undefined` means "let the browser choose",
 * which is the correct fallback when `isTypeSupported` is missing entirely.
 */
function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;

  return RECORDER_MIME_CANDIDATES.find((candidate) =>
    MediaRecorder.isTypeSupported(candidate),
  );
}

/**
 * Capability detection read through `useSyncExternalStore`.
 *
 * Browser support is external state, so it is read during render with an
 * explicit server snapshot rather than assigned from an effect. That avoids both
 * a hydration mismatch and a cascading re-render on mount.
 */
const subscribeToStaticValue = () => () => {};

function getRecorderSupport(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** During SSR, assume support and let hydration correct it. */
function getRecorderSupportOnServer(): boolean {
  return true;
}

function describeMicrophoneError(error: unknown): {
  message: string;
  permissionDenied: boolean;
} {
  const name = error instanceof DOMException ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        message:
          "Microphone access is blocked. Allow it for this site in your browser's address bar or site settings, then try again.",
        permissionDenied: true,
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        message:
          "No microphone was found. Connect one and reload the page to try again.",
        permissionDenied: false,
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        message:
          "Your microphone is in use by another app. Close it and try again.",
        permissionDenied: false,
      };
    case "OverconstrainedError":
      return {
        message:
          "Your microphone doesn't support the requested settings. Try a different input device.",
        permissionDenied: false,
      };
    default:
      return {
        message: "We couldn't start recording. Please try again.",
        permissionDenied: false,
      };
  }
}

/**
 * Owns one audio clip at a time, from either the microphone or a file picker.
 *
 * Responsibilities kept deliberately narrow: capture, timing, permission
 * errors, and lifecycle cleanup. Uploading and extraction live in the component
 * that consumes this, so the hook stays reusable for other pipelines.
 */
export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [duration, setDuration] = useState(0);
  const [clip, setClip] = useState<AudioClip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  const isSupported = useSyncExternalStore(
    subscribeToStaticValue,
    getRecorderSupport,
    getRecorderSupportOnServer,
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Mirrors the live object URL so unmount cleanup can revoke it. */
  const objectUrlRef = useRef<string | null>(null);

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  /** Releases the microphone. Without this the browser tab keeps its "recording" indicator. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const publishClip = useCallback(
    (next: Omit<AudioClip, "url">) => {
      revokeObjectUrl();

      const url = URL.createObjectURL(next.blob);
      objectUrlRef.current = url;

      setClip({ ...next, url });
      setStatus("ready");
    },
    [revokeObjectUrl],
  );

  const startRecording = useCallback(async () => {
    // Guard against a double click racing two getUserMedia prompts.
    if (status === "recording" || status === "requesting-permission") return;

    if (!getRecorderSupport()) {
      setError(
        "This browser can't record audio. Try the latest Chrome, Edge, Firefox or Safari, or upload an audio file instead.",
      );
      return;
    }

    setError(null);
    setIsPermissionDenied(false);
    revokeObjectUrl();
    setClip(null);
    setDuration(0);
    setStatus("requesting-permission");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError) {
      const { message, permissionDenied } = describeMicrophoneError(permissionError);
      setError(message);
      setIsPermissionDenied(permissionDenied);
      setStatus("idle");
      return;
    }

    const mimeType = pickRecorderMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mimeType === undefined ? undefined : { mimeType },
      );
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError(
        "This browser couldn't start a recording in a supported audio format. Try uploading an audio file instead.",
      );
      setStatus("idle");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onerror = () => {
      stopTicking();
      releaseStream();
      recorderRef.current = null;
      chunksRef.current = [];
      setError("Recording stopped unexpectedly. Please try again.");
      setStatus("idle");
    };

    recorder.onstop = () => {
      stopTicking();
      releaseStream();

      const elapsedSeconds = Math.min(
        MAX_RECORDING_SECONDS,
        Math.round((Date.now() - startedAtRef.current) / 1000),
      );
      const resolvedType =
        recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: resolvedType });

      chunksRef.current = [];
      recorderRef.current = null;
      setDuration(elapsedSeconds);

      if (blob.size < MIN_AUDIO_BYTES) {
        setError(
          "That recording came out empty. Check your microphone input level and try again.",
        );
        setStatus("idle");
        return;
      }

      publishClip({
        blob,
        mimeType: resolvedType,
        fileName: `recording.${fileExtensionForMimeType(resolvedType)}`,
        durationSeconds: elapsedSeconds,
        source: "recording",
      });
    };

    startedAtRef.current = Date.now();
    setStatus("recording");

    // A timeslice makes `ondataavailable` fire periodically, which is more
    // reliable across browsers than relying on a single flush at stop.
    recorder.start(1_000);

    tickRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setDuration(Math.min(MAX_RECORDING_SECONDS, Math.floor(elapsed)));

      if (elapsed >= MAX_RECORDING_SECONDS) {
        stopTicking();
        // `onstop` finishes the teardown and publishes the clip.
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }
    }, 200);
  }, [publishClip, releaseStream, revokeObjectUrl, status, stopTicking]);

  const stopRecording = useCallback(() => {
    stopTicking();

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }

    // Nothing was actually running; make sure the mic is still released.
    releaseStream();
  }, [releaseStream, stopTicking]);

  const resetRecording = useCallback(() => {
    stopTicking();

    if (recorderRef.current?.state === "recording") {
      // Drop the in-flight result rather than publishing it.
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }

    recorderRef.current = null;
    chunksRef.current = [];
    releaseStream();
    revokeObjectUrl();

    setClip(null);
    setDuration(0);
    setError(null);
    setIsPermissionDenied(false);
    setStatus("idle");
  }, [releaseStream, revokeObjectUrl, stopTicking]);

  const loadAudioFile = useCallback(
    (file: File) => {
      setError(null);
      setIsPermissionDenied(false);

      if (!isAcceptedAudioMimeType(file.type)) {
        setError(
          "That file type isn't supported. Choose a WebM, MP4, M4A, MP3, WAV, OGG or FLAC file.",
        );
        return;
      }

      if (file.size < MIN_AUDIO_BYTES) {
        setError("That file is too small to contain any speech.");
        return;
      }

      if (file.size > MAX_AUDIO_BYTES) {
        setError(`That file is too large. The limit is ${formatMegabytes(MAX_AUDIO_BYTES)}.`);
        return;
      }

      setDuration(0);
      publishClip({
        blob: file,
        mimeType: file.type,
        fileName: file.name,
        durationSeconds: 0,
        source: "upload",
      });
    },
    [publishClip],
  );

  // Unmount only: stop the microphone and release the object URL. Depends on
  // stable callbacks and refs, never on the clip itself, so a new recording
  // does not tear down the current one.
  useEffect(() => {
    return () => {
      stopTicking();

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }

      releaseStream();
      revokeObjectUrl();
    };
  }, [releaseStream, revokeObjectUrl, stopTicking]);

  return {
    status,
    isRecording: status === "recording",
    isSupported,
    isPermissionDenied,
    duration,
    maxDuration: MAX_RECORDING_SECONDS,
    audioBlob: clip?.blob ?? null,
    audioUrl: clip?.url ?? null,
    clip,
    error,
    startRecording,
    stopRecording,
    resetRecording,
    loadAudioFile,
  };
}
