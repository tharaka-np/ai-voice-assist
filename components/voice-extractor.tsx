"use client";

import { useCallback, useRef, useState } from "react";

import { AudioPlayer } from "@/components/audio-player";
import { AudioRecorder } from "@/components/audio-recorder";
import { ContactResults } from "@/components/contact-results";
import { CriteriaChips } from "@/components/criteria-chips";
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
import type { TranscriptionProviderId, TranscriptionProviderOption } from "@/lib/transcription/types";
import {
  clearField,
  emptyMeetingRequest,
  hasContactCriteria,
  type ContactField,
  type ConversationState,
  type MeetingField,
} from "@/schemas/meeting-request";
import {
  PROCESS_AUDIO_FIELDS,
  type ContactSearchResponse,
  type ProcessAudioResponse,
  type SavedMeeting,
  type TranscriptionMeta,
} from "@/types/api";

const PROCESSING_MESSAGE = "Transcribing and extracting…";

type LastTurn = {
  transcript: string;
  transcription: TranscriptionMeta;
};

type VoiceExtractorProps = {
  providerOptions: TranscriptionProviderOption[];
  defaultProviderId: TranscriptionProviderId;
};

/**
 * Orchestrates a multi-turn conversational contact search.
 *
 * Owns the accumulated conversation state and echoes it back to the server on
 * every turn, so the merge stays server-side and deterministic while this
 * component remains the single source of truth for what the user has told us.
 *
 * State survives a failed turn on purpose: a transcription or extraction error
 * leaves the criteria untouched so the user can simply speak again.
 */
export function VoiceExtractor({
  providerOptions,
  defaultProviderId,
}: VoiceExtractorProps) {
  const recorder = useAudioRecorder();

  const [providerId, setProviderId] =
    useState<TranscriptionProviderId>(defaultProviderId);
  const [state, setState] = useState<ConversationState>(emptyMeetingRequest);
  const [search, setSearch] = useState<ContactSearchOutcome>(idleSearchOutcome);
  const [lastTurn, setLastTurn] = useState<LastTurn | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [savedMeeting, setSavedMeeting] = useState<SavedMeeting | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  /** Guards a second submit that lands before `isProcessing` has re-rendered. */
  const inFlightRef = useRef(false);

  const busy = isProcessing || isSearching;

  const handleStartOver = useCallback(() => {
    setState(emptyMeetingRequest);
    setSearch(idleSearchOutcome);
    setLastTurn(null);
    setTurnCount(0);
    setSelectedContactId(null);
    setSavedMeeting(null);
    setRequestError(null);
    recorder.resetRecording();
  }, [recorder]);

  /** Reruns the search for a state the user edited directly. */
  const runSearch = useCallback(async (nextState: ConversationState) => {
    setIsSearching(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextState),
      });

      const payload = (await response.json()) as ContactSearchResponse;

      if (!response.ok || payload.success === false) {
        setRequestError(
          payload.success === false ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        return;
      }

      setSearch(payload.search);
      // Drop a selection that is no longer among the results.
      setSelectedContactId((current) =>
        current !== null &&
        payload.search.contacts.some((contact) => contact.id === current)
          ? current
          : payload.search.selectedContactId,
      );
    } catch {
      setRequestError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleRemoveCriterion = useCallback(
    (field: ContactField | MeetingField) => {
      const nextState = clearField(state, field);
      setState(nextState);
      setSavedMeeting(null);

      if (hasContactCriteria(nextState)) {
        void runSearch(nextState);
      } else {
        // Nothing left to search on; go back to the idle prompt rather than
        // showing a stale result list.
        setSearch(idleSearchOutcome);
        setSelectedContactId(null);
      }
    },
    [runSearch, state],
  );

  /** Sends one turn: audio plus the state accumulated so far. */
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
      // The server merges this with the new turn, so accumulation never depends
      // on the model remembering anything.
      formData.append(PROCESS_AUDIO_FIELDS.state, JSON.stringify(state));

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
        // Criteria are deliberately left intact so the user can just try again.
        setRequestError(
          payload.success === false ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        return;
      }

      setState(payload.state);
      setSearch(payload.search);
      setLastTurn({
        transcript: payload.transcript,
        transcription: payload.transcription,
      });
      setTurnCount((count) => count + 1);
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
  }, [providerId, recorder, state]);

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
            disabled={busy}
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
          busy={busy}
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
                disabled={busy || !isProviderAvailable}
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
            <Button variant="ghost" onClick={handleStartOver} disabled={busy}>
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
            <p className="mt-2">Your search criteria have been kept.</p>
          ) : null}
        </Alert>
      ) : null}

      {lastTurn !== null ? (
        <TranscriptCard
          transcript={lastTurn.transcript}
          transcription={lastTurn.transcription}
        />
      ) : null}

      <CriteriaChips
        state={state}
        busy={busy}
        onRemove={handleRemoveCriterion}
      />

      {savedMeeting === null ? (
        <ContactResults
          search={search}
          selectedContactId={selectedContactId}
          busy={busy}
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
