"use client";

import { useCallback, useRef, useState } from "react";

import { AudioPlayer } from "@/components/audio-player";
import { AudioRecorder } from "@/components/audio-recorder";
import { ContactResults } from "@/components/contact-results";
import { ConversationSummary } from "@/components/conversation-summary";
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
  idleSearchOutcome,
  type ContactSearchOutcome,
} from "@/lib/matching/contact-match";
import type {
  TranscriptionProviderId,
  TranscriptionProviderOption,
} from "@/lib/transcription/types";
import {
  initialConversationState,
  type ConversationState,
} from "@/schemas/meeting-request";
import {
  PROCESS_AUDIO_FIELDS,
  type ProcessAudioResponse,
  type SavedMeeting,
  type TranscriptionMeta,
} from "@/types/api";

const PROCESSING_MESSAGE = "Transcribing and extracting…";

type VoiceExtractorProps = {
  providerOptions: TranscriptionProviderOption[];
  defaultProviderId: TranscriptionProviderId;
};

/**
 * Orchestrates a multi-turn conversational contact search.
 *
 * The only thing this component carries between turns is `transcripts` — the
 * conversation itself. It never merges extracted fields. Every turn sends the whole
 * transcript history to the server, the model re-derives the complete picture from
 * it, and `state` is replaced wholesale with whatever comes back.
 *
 * That is what makes spoken corrections work: "actually, Kandy" or "find Eric Poe
 * instead" are simply later messages, and the model is told the latest mention
 * wins. There is no local state for such a correction to fight against.
 *
 * The trade-off is that `state` is no longer deterministic. It is a model output,
 * validated by Zod on the server, and it is re-derived on every turn rather than
 * accumulated.
 */
export function VoiceExtractor({
  providerOptions,
  defaultProviderId,
}: VoiceExtractorProps) {
  const recorder = useAudioRecorder();

  const [providerId, setProviderId] =
    useState<TranscriptionProviderId>(defaultProviderId);

  /** The conversation. The single piece of state carried across turns. */
  const [transcripts, setTranscripts] = useState<string[]>([]);
  /** The latest model output. Derived, replaced each turn, never combined. */
  const [state, setState] = useState<ConversationState>(initialConversationState);
  const [search, setSearch] = useState<ContactSearchOutcome>(idleSearchOutcome);
  const [lastTranscription, setLastTranscription] =
    useState<TranscriptionMeta | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [savedMeeting, setSavedMeeting] = useState<SavedMeeting | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  /** Guards a second submit that lands before `isProcessing` has re-rendered. */
  const inFlightRef = useRef(false);

  const handleStartOver = useCallback(() => {
    setTranscripts([]);
    setState(initialConversationState);
    setSearch(idleSearchOutcome);
    setLastTranscription(null);
    setSelectedContactId(null);
    setSavedMeeting(null);
    setRequestError(null);
    recorder.resetRecording();
  }, [recorder]);

  const handleSubmitTurn = useCallback(async () => {
    const clip = recorder.clip;
    if (clip === null || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsProcessing(true);
    setRequestError(null);
    setSavedMeeting(null);

    try {
      const formData = new FormData();
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
      // The conversation so far. The server appends this turn's transcript and
      // hands the whole thing to the model.
      formData.append(PROCESS_AUDIO_FIELDS.history, JSON.stringify(transcripts));

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
        // The conversation is deliberately left intact so the user can retry.
        setRequestError(
          payload.success === false ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        return;
      }

      setTranscripts(payload.transcripts);
      setState(payload.state);
      setSearch(payload.search);
      setLastTranscription(payload.transcription);
      setSelectedContactId(payload.search.selectedContactId);

      // Clear the clip so the microphone is ready for the next turn.
      recorder.resetRecording();
    } catch {
      setRequestError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [providerId, recorder, transcripts]);

  const activeError = requestError ?? recorder.error;
  const selectedOption = providerOptions.find(
    (option) => option.id === providerId,
  );
  const isProviderAvailable = selectedOption?.available ?? false;
  const noProviderConfigured = providerOptions.every(
    (option) => !option.available,
  );

  const selectedContact =
    selectedContactId === null
      ? null
      : (search.contacts.find((contact) => contact.id === selectedContactId) ??
        null);

  const turnCount = transcripts.length;
  const isFirstTurn = turnCount === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle hint={isFirstTurn ? "Step 1" : `Turn ${turnCount + 1}`}>
          {isFirstTurn ? "Describe who you are looking for" : "Add more details"}
        </CardTitle>

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
          onStart={recorder.startRecording}
          onStop={recorder.stopRecording}
          onReset={recorder.resetRecording}
          onSelectFile={recorder.loadAudioFile}
        />

        {recorder.audioUrl !== null ? (
          <div className="mt-5 space-y-5">
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
                onClick={handleSubmitTurn}
                disabled={isProcessing || !isProviderAvailable}
              >
                {isProcessing
                  ? PROCESSING_MESSAGE
                  : isFirstTurn
                    ? "Search for this contact"
                    : "Add these details"}
              </Button>

              <span
                role="status"
                aria-live="polite"
                className="text-sm text-slate-500 dark:text-slate-400"
              >
                {isProcessing ? PROCESSING_MESSAGE : null}
              </span>
            </div>
          </div>
        ) : null}

        {turnCount > 0 ? (
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button variant="ghost" onClick={handleStartOver} disabled={isProcessing}>
              Start over
            </Button>
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
          {turnCount > 0 ? (
            <p className="mt-2">Your conversation has been kept.</p>
          ) : null}
        </Alert>
      ) : null}

      {lastTranscription !== null && recorder.clip === null && turnCount > 0 ? (
        <TranscriptCard
          transcript={transcripts[transcripts.length - 1] ?? ""}
          transcription={lastTranscription}
        />
      ) : null}

      <ConversationSummary transcripts={transcripts} state={state} />

      {savedMeeting === null ? (
        <ContactResults
          search={search}
          selectedContactId={selectedContactId}
          busy={isProcessing}
          onSelect={setSelectedContactId}
        />
      ) : null}

      {savedMeeting !== null ? (
        <>
          <SavedMeetingCard meeting={savedMeeting} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleStartOver}>
              Start a new search
            </Button>
          </div>
        </>
      ) : null}

      {savedMeeting === null && selectedContact !== null ? (
        /* Keyed on the contact so choosing a different person remounts the form
           and re-reads the initial values, rather than syncing via an effect. */
        <MeetingForm
          key={`meeting-form-${selectedContact.id}`}
          contact={selectedContact}
          state={state}
          onSaved={setSavedMeeting}
          onChangeContact={() => setSelectedContactId(null)}
        />
      ) : null}
    </div>
  );
}
