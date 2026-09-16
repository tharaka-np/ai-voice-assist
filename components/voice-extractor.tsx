"use client";

import { useCallback, useRef, useState } from "react";

import { AudioPlayer } from "@/components/audio-player";
import { AudioRecorder } from "@/components/audio-recorder";
import { ContactResults } from "@/components/contact-results";
import {
  ConversationSummary,
  type Utterance,
} from "@/components/conversation-summary";
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

  /** The conversation sent to the model. Criteria turns only. */
  const [transcripts, setTranscripts] = useState<string[]>([]);
  /**
   * Everything heard, commands included. Display only — never sent anywhere.
   * Kept separate from `transcripts` so a command can be shown without becoming
   * a search detail.
   */
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  /** The latest model output. Derived, replaced each turn, never combined. */
  const [state, setState] = useState<ConversationState>(initialConversationState);
  const [search, setSearch] = useState<ContactSearchOutcome>(idleSearchOutcome);
  const [lastTranscription, setLastTranscription] =
    useState<TranscriptionMeta | null>(null);

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [savedMeeting, setSavedMeeting] = useState<SavedMeeting | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  /** A position was named but could not be honoured. Not an error; the turn stood. */
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

  /** Guards a second submit that lands before `isProcessing` has re-rendered. */
  const inFlightRef = useRef(false);

  const handleStartOver = useCallback(() => {
    setTranscripts([]);
    setUtterances([]);
    setState(initialConversationState);
    setSearch(idleSearchOutcome);
    setLastTranscription(null);
    setSelectedContactId(null);
    setSavedMeeting(null);
    setRequestError(null);
    setSelectionWarning(null);
    recorder.resetRecording();
  }, [recorder]);

  const handleSubmitTurn = useCallback(async () => {
    const clip = recorder.clip;
    if (clip === null || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsProcessing(true);
    setRequestError(null);
    setSelectionWarning(null);
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
      // What is on screen right now, in display order, so a spoken "the third
      // one" resolves against exactly what the user can see.
      formData.append(
        PROCESS_AUDIO_FIELDS.displayedContactIds,
        JSON.stringify(search.contacts.map((contact) => contact.id)),
      );
      // The choice already in effect, so a turn that only adds meeting details
      // keeps it. Includes a row picked by clicking, which is why this reads from
      // state rather than from the last response.
      if (selectedContactId !== null) {
        formData.append(
          PROCESS_AUDIO_FIELDS.selectedContactId,
          String(selectedContactId),
        );
      }

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

      // One path for every turn. The criteria always apply; a named position is an
      // extra signal the server has already resolved and validated.
      setLastTranscription(payload.transcription);
      setUtterances((previous) => [
        ...previous,
        { text: payload.transcript, selectedPosition: payload.selectedPosition },
      ]);
      setTranscripts(payload.transcripts);
      setState(payload.state);
      setSearch(payload.search);
      setSelectedContactId(payload.selectedContactId);
      setSelectionWarning(payload.selectionWarning);

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
  }, [providerId, recorder, transcripts, search.contacts, selectedContactId]);

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

  /**
   * The meeting details as the model currently has them, as one comparable string.
   *
   * Part of the `MeetingForm` key. Value-based rather than identity-based on
   * purpose: `state` is a fresh object every turn, so keying on the object would
   * remount the form after every single utterance and discard whatever the user had
   * typed. This changes only when a date, time or purpose actually changes.
   */
  const meetingSignature = `${state.meetingDate}|${state.meetingTime}|${state.notes}`;

  /**
   * Whether the capture controls live inside the matches card this turn.
   *
   * Once there are rows on screen, refining is done from there: record, play back
   * and submit all sit under the list, so choosing and correcting happen in one
   * place instead of scrolling between two cards.
   *
   * `contacts.length > 0` is the right test rather than the mode, because it is
   * exactly the condition under which `ContactResults` renders a card at all — the
   * `idle` and `empty` outcomes both carry no rows. Without that the controls would
   * have nowhere to go on a turn that matched nobody, and the conversation would be
   * unrecoverable.
   */
  const controlsInResults =
    !isFirstTurn && savedMeeting === null && search.contacts.length > 0;

  /**
   * Record, play back, submit. Defined once and rendered in exactly one place —
   * either the top card or the matches card, never both, so there is only ever one
   * submit button and one live region.
   */
  const captureControls = (
    <>
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
    </>
  );

  return (
    <div className="space-y-6">
      {/* Stays at the top all the way through. The engine choice is a setting for
          the whole conversation, not part of a turn, so it does not travel with the
          record button. */}
      <Card>
        <CardTitle hint={isFirstTurn ? "Step 1" : `Turn ${turnCount + 1}`}>
          {isFirstTurn
            ? "Describe who you are looking for"
            : controlsInResults
              ? // Not "Transcription engine": the picker below carries that as its
                // own legend, and repeating it reads as a mistake.
                "Conversation"
              : "Add more details"}
        </CardTitle>

        <div
          className={
            controlsInResults
              ? undefined
              : "mb-5 border-b border-slate-200 pb-5 dark:border-slate-800"
          }
        >
          <ProviderSelector
            options={providerOptions}
            value={providerId}
            disabled={isProcessing}
            onChange={setProviderId}
          />
        </div>

        {controlsInResults ? null : captureControls}

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

      {/* Separate from the error banner: the turn succeeded and its criteria were
          kept, only the named position could not be applied. */}
      {selectionWarning !== null ? (
        <Alert tone="info" title="Couldn't use that position">
          {selectionWarning} Everything else from that sentence was kept.
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

      {/* Shows the last thing heard whatever kind of turn it was, so a command
          gets the same acknowledgement a criteria turn does. */}
      {lastTranscription !== null &&
      recorder.clip === null &&
      utterances.length > 0 ? (
        <TranscriptCard
          transcript={utterances[utterances.length - 1]?.text ?? ""}
          transcription={lastTranscription}
        />
      ) : null}

      <ConversationSummary utterances={utterances} state={state} />

      {savedMeeting === null ? (
        <ContactResults
          search={search}
          selectedContactId={selectedContactId}
          busy={isProcessing}
          onSelect={setSelectedContactId}
          // Refining happens under the list it refines. Null on the first turn, so
          // the initial card keeps the controls and this one stays a pure result
          // list until there is something to correct.
          footer={controlsInResults ? captureControls : null}
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
        /* Keyed on the contact *and* the meeting details, so the form re-reads its
           initial values whenever either changes, rather than syncing via an
           effect. Keying on the contact alone left the form stale: a later turn
           that supplied a date for the same person changed nothing on screen until
           you clicked Change and picked them again. */
        <MeetingForm
          key={`meeting-form-${selectedContact.id}-${meetingSignature}`}
          contact={selectedContact}
          state={state}
          onSaved={setSavedMeeting}
          onChangeContact={() => setSelectedContactId(null)}
        />
      ) : null}
    </div>
  );
}
