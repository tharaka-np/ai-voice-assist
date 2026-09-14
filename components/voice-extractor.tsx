"use client";

import { useCallback, useRef, useState } from "react";

import { AudioPlayer } from "@/components/audio-player";
import { AudioRecorder } from "@/components/audio-recorder";
import { ExtractionResult } from "@/components/extraction-result";
import { MeetingForm } from "@/components/meeting-form";
import { ProviderSelector } from "@/components/provider-selector";
import { SavedMeetingCard } from "@/components/saved-meeting";
import { TranscriptCard } from "@/components/transcript-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { GENERIC_ERROR_MESSAGE } from "@/lib/errors";
import { resolveBrowserTimeZone, toLocalIsoString } from "@/lib/format";
import {
  TRANSCRIPTION_PROVIDER_IDS,
  type TranscriptionProviderId,
  type TranscriptionProviderOption,
} from "@/lib/transcription/types";
import {
  PROCESS_AUDIO_FIELDS,
  type ProcessAudioResponse,
  type ProcessAudioSuccess,
  type SavedMeeting,
} from "@/types/api";

const PROCESSING_MESSAGE = "Transcribing and extracting information…";

/** One result per engine, so the same recording can be compared side by side. */
type ResultsByProvider = Partial<
  Record<TranscriptionProviderId, ProcessAudioSuccess>
>;

type VoiceExtractorProps = {
  providerOptions: TranscriptionProviderOption[];
  defaultProviderId: TranscriptionProviderId;
};

/**
 * Single stateful orchestrator for the whole flow.
 *
 * The recorder hook owns the audio clip; this component owns the provider
 * choice, the request lifecycle and the results. Everything below it is
 * presentational, so there is exactly one place where state transitions happen.
 */
export function VoiceExtractor({
  providerOptions,
  defaultProviderId,
}: VoiceExtractorProps) {
  const recorder = useAudioRecorder();

  const [providerId, setProviderId] =
    useState<TranscriptionProviderId>(defaultProviderId);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ResultsByProvider>({});
  /** The run the form is bound to: the most recent successful extraction. */
  const [activeResult, setActiveResult] = useState<ProcessAudioSuccess | null>(
    null,
  );
  const [savedMeeting, setSavedMeeting] = useState<SavedMeeting | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  /** Incremented per extraction; used as the form's `key` to force a remount. */
  const [runId, setRunId] = useState(0);

  /** Guards a second submit that lands before `isProcessing` has re-rendered. */
  const inFlightRef = useRef(false);

  const clearResults = useCallback(() => {
    setResults({});
    setActiveResult(null);
    setSavedMeeting(null);
    setRequestError(null);
  }, []);

  const handleStart = useCallback(() => {
    clearResults();
    void recorder.startRecording();
  }, [clearResults, recorder]);

  const handleReset = useCallback(() => {
    clearResults();
    recorder.resetRecording();
  }, [clearResults, recorder]);

  const handleSelectFile = useCallback(
    (file: File) => {
      clearResults();
      recorder.loadAudioFile(file);
    },
    [clearResults, recorder],
  );

  const handleExtract = useCallback(async () => {
    const clip = recorder.clip;
    if (clip === null || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsProcessing(true);
    setRequestError(null);
    setSavedMeeting(null);

    try {
      const formData = new FormData();
      // Wrap the blob in a File so the filename, and therefore the container
      // extension, reaches the transcription provider.
      formData.append(
        PROCESS_AUDIO_FIELDS.audio,
        new File([clip.blob], clip.fileName, { type: clip.mimeType }),
        clip.fileName,
      );
      formData.append(PROCESS_AUDIO_FIELDS.timezone, resolveBrowserTimeZone());
      formData.append(
        PROCESS_AUDIO_FIELDS.currentDateTime,
        toLocalIsoString(new Date()),
      );
      formData.append(PROCESS_AUDIO_FIELDS.provider, providerId);

      const response = await fetch("/api/process-audio", {
        method: "POST",
        body: formData,
      });

      let payload: ProcessAudioResponse;
      try {
        payload = (await response.json()) as ProcessAudioResponse;
      } catch {
        setRequestError(GENERIC_ERROR_MESSAGE);
        return;
      }

      if (!response.ok || payload.success === false) {
        setRequestError(
          payload.success === false ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        return;
      }

      // Keyed by the provider the server actually used, not the one requested.
      setResults((previous) => ({
        ...previous,
        [payload.transcription.provider]: payload,
      }));
      setActiveResult(payload);
      // Drives the form's `key`, forcing a fresh form per extraction run.
      setRunId((previous) => previous + 1);
    } catch {
      // Thrown by `fetch` itself: offline, DNS failure, request aborted.
      setRequestError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [providerId, recorder.clip]);

  const activeError = requestError ?? recorder.error;
  const selectedOption = providerOptions.find(
    (option) => option.id === providerId,
  );
  const isSelectedProviderAvailable = selectedOption?.available ?? false;
  const noProviderConfigured = providerOptions.every(
    (option) => !option.available,
  );

  const completedRuns = TRANSCRIPTION_PROVIDER_IDS.map((id) => results[id]).filter(
    (run): run is ProcessAudioSuccess => run !== undefined,
  );
  const hasRunSelectedProvider = results[providerId] !== undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle hint="Step 1">Record</CardTitle>

        {/* Kept above the controls and always visible: the engine is a choice
            the user makes before recording, and stakeholders need to see that
            the option exists without having to record first. */}
        <div className="mb-5 border-b border-slate-200 pb-5 dark:border-slate-800">
          <ProviderSelector
            options={providerOptions}
            value={providerId}
            disabled={isProcessing}
            onChange={setProviderId}
          />
        </div>

        {!recorder.isSupported ? (
          <div className="mb-4">
            <Alert tone="info" title="Recording isn't available in this browser">
              Your browser doesn&apos;t support the MediaRecorder API. Try the
              latest Chrome, Edge, Firefox or Safari.
            </Alert>
          </div>
        ) : null}

        <AudioRecorder
          status={recorder.status}
          isSupported={recorder.isSupported}
          duration={recorder.duration}
          maxDuration={recorder.maxDuration}
          hasClip={recorder.clip !== null}
          busy={isProcessing}
          onStart={handleStart}
          onStop={recorder.stopRecording}
          onReset={handleReset}
          onSelectFile={handleSelectFile}
        />

        {recorder.audioUrl !== null ? (
          <div className="mt-5 space-y-5">
            {/* Remount on a new clip so the element loads the new buffer. */}
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
              <Button
                onClick={handleExtract}
                disabled={isProcessing || !isSelectedProviderAvailable}
              >
                {isProcessing
                  ? PROCESSING_MESSAGE
                  : hasRunSelectedProvider
                    ? `Re-run with ${selectedOption?.label ?? "this engine"}`
                    : "Extract information"}
              </Button>

              <span
                role="status"
                aria-live="polite"
                className="text-sm text-slate-500 dark:text-slate-400"
              >
                {isProcessing ? PROCESSING_MESSAGE : null}
              </span>
            </div>

            {completedRuns.length === 1 && !noProviderConfigured ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Switch the engine above and extract again to compare both on this
                same recording.
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {noProviderConfigured ? (
        <Alert tone="info" title="No transcription engine is configured">
          Add an <code>OPENAI_API_KEY</code> or a <code>DEEPGRAM_API_KEY</code> to{" "}
          <code>.env.local</code> and restart the server.
        </Alert>
      ) : null}

      {activeError !== null ? (
        <Alert tone="error" title="Something went wrong">
          {activeError}
          {recorder.isPermissionDenied ? (
            <p className="mt-2">
              In Chrome and Edge, use the icon at the left of the address bar. In
              Safari, check Settings → Websites → Microphone. In Firefox, clear
              the blocked permission from the padlock menu.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {completedRuns.map((run) => (
        <TranscriptCard
          key={run.transcription.provider}
          transcript={run.transcript}
          transcription={run.transcription}
        />
      ))}

      {/* Saved is a terminal state: the form is replaced by what was written, so
          there is no half-edited form left implying more work to do. */}
      {savedMeeting !== null ? (
        <>
          <SavedMeetingCard meeting={savedMeeting} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleReset}>
              Record another
            </Button>
          </div>
        </>
      ) : null}

      {savedMeeting === null && activeResult !== null ? (
        <>
          {/* `key` changes on every extraction so React remounts the form and
              it re-reads the new proposal, instead of syncing via an effect. */}
          <MeetingForm
            key={`meeting-form-${runId}`}
            proposed={activeResult.data}
            nameMatch={activeResult.nameMatch}
            onSaved={setSavedMeeting}
          />
          <ExtractionResult
            data={activeResult.data}
            transcription={activeResult.transcription}
          />
        </>
      ) : null}
    </div>
  );
}
