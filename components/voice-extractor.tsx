"use client";

import { useCallback, useRef, useState } from "react";

import { ContactResults } from "@/components/contact-results";
import {
  ConversationSummary,
  type Utterance,
} from "@/components/conversation-summary";
import { MeetingForm } from "@/components/meeting-form";
import { MicDock } from "@/components/mic-dock";
import { ProviderSelector } from "@/components/provider-selector";
import { SavedMeetingCard } from "@/components/saved-meeting";
import { StepIndicator, type FlowStep } from "@/components/step-indicator";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
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
 *
 * Layout is a two-pane workbench. A sticky rail holds the conversation and the one
 * copy of the capture controls; the main pane holds the workflow. That arrangement
 * replaced a single stacked column of five cards, in which the record button had to
 * migrate between cards to stay reachable and six surfaces were rendered twice.
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

  /** Where the user is, read off existing state rather than tracked separately. */
  const step: FlowStep =
    savedMeeting !== null
      ? "saved"
      : selectedContact !== null
        ? "confirm"
        : search.contacts.length > 0
          ? "choose"
          : "describe";

  return (
    <div className="space-y-5">
      {/* Settings strip. The engine choice applies to the whole conversation, so it
          lives here rather than travelling with the record button, and it is folded
          away because it is set once and rarely revisited. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <Disclosure
          className="min-w-0 flex-1"
          summary={
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Engine</span>
              <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                {selectedOption?.label ?? "Not configured"}
              </span>
              {selectedOption !== undefined ? (
                <code className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 sm:inline dark:bg-slate-800 dark:text-slate-300">
                  {selectedOption.model}
                </code>
              ) : null}
            </span>
          }
        >
          <ProviderSelector
            options={providerOptions}
            value={providerId}
            disabled={isProcessing}
            onChange={setProviderId}
          />
        </Disclosure>

        {turnCount > 0 ? (
          <Button
            variant="ghost"
            onClick={handleStartOver}
            disabled={isProcessing}
          >
            Start over
          </Button>
        ) : null}
      </div>

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
              Safari, check Settings → Websites → Microphone. In Firefox, clear the
              blocked permission from the padlock menu.
            </p>
          ) : null}
          {turnCount > 0 ? (
            <p className="mt-2">Your conversation has been kept.</p>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-12">
        {/*
          Rail. Second in the source order on small screens so the workflow leads,
          but first visually from `lg` up. Sticky, so the capture controls never
          scroll away — which is what removed the need to relocate them per turn.
        */}
        <aside className="order-2 lg:order-1 lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-6">
            <MicDock
              recorder={recorder}
              busy={isProcessing}
              canSubmit={isProviderAvailable}
              submitLabel={
                isFirstTurn ? "Search for this contact" : "Add these details"
              }
              processingLabel={PROCESSING_MESSAGE}
              onSubmit={handleSubmitTurn}
            />

            <ConversationSummary
              utterances={utterances}
              state={state}
              // Hidden while the form is open: the form is the editable view of
              // exactly these values.
              showMeeting={selectedContact === null && savedMeeting === null}
              transcription={lastTranscription}
            />
          </div>
        </aside>

        <div className="order-1 space-y-5 lg:order-2 lg:col-span-8">
          <StepIndicator step={step} />

          {isFirstTurn && activeError === null ? (
            <Card>
              <CardTitle hint="Step 1">Describe who you are looking for</CardTitle>

              <p className="text-sm text-slate-600 dark:text-slate-400">
                Record a sentence naming the person. You can add the meeting in the
                same breath, or in a later turn — whatever you leave out stays empty
                rather than being guessed.
              </p>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Try saying
                </p>
                {[
                  "Find Amanda Wilson in Austin.",
                  "Schedule a meeting on September 20th, 2026 at 2 PM to discuss the Spice CRM release.",
                ].map((example) => (
                  <p
                    key={example}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                  >
                    &ldquo;{example}&rdquo;
                  </p>
                ))}
              </div>
            </Card>
          ) : null}

          {savedMeeting === null ? (
            <ContactResults
              search={search}
              selectedContactId={selectedContactId}
              busy={isProcessing}
              onSelect={setSelectedContactId}
            />
          ) : null}

          {savedMeeting === null && selectedContact !== null ? (
            /* Keyed on the contact *and* the meeting details, so the form re-reads
               its initial values whenever either changes, rather than syncing via an
               effect. Keying on the contact alone left the form stale: a later turn
               that supplied a date for the same person changed nothing on screen
               until you clicked Change and picked them again. */
            <MeetingForm
              key={`meeting-form-${selectedContact.id}-${meetingSignature}`}
              contact={selectedContact}
              state={state}
              onSaved={setSavedMeeting}
            />
          ) : null}

          {savedMeeting !== null ? (
            <>
              <SavedMeetingCard meeting={savedMeeting} />
              <Button variant="secondary" onClick={handleStartOver}>
                Start a new search
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
