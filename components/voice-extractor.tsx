"use client";

import { useCallback, useRef, useState } from "react";

import { Composer } from "@/components/chat/composer";
import { MessageRow } from "@/components/chat/message-row";
import { MessageList } from "@/components/chat/message-list";
import {
  newMessageId,
  type ChatMessage,
  type UserMessage,
} from "@/components/chat/types";
import { MeetingForm } from "@/components/meeting-form";
import { ProviderSelector } from "@/components/provider-selector";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
} from "@/types/api";

type VoiceExtractorProps = {
  providerOptions: TranscriptionProviderOption[];
  defaultProviderId: TranscriptionProviderId;
};

/**
 * Orchestrates a multi-turn conversational contact search, as a chat.
 *
 * What crosses turns is still only `transcripts` — the conversation itself. Extracted
 * fields are never merged here. Every turn sends the whole transcript history to the
 * server, the model re-derives the complete picture from it, and `state` is replaced
 * wholesale with whatever comes back. That is what makes spoken corrections work:
 * "actually, Kandy" is just a later message, with no local state to fight.
 *
 * `messages` is new and is *display only*. The conversation state above is
 * latest-only by design, so there was nothing to render a history from. The log
 * records what each turn produced; it never feeds the model and never feeds the
 * search. Only the newest search message is interactive — acting on an older one
 * would apply a choice to a list that has since changed.
 */
export function VoiceExtractor({
  providerOptions,
  defaultProviderId,
}: VoiceExtractorProps) {
  const recorder = useAudioRecorder();

  const [providerId, setProviderId] =
    useState<TranscriptionProviderId>(defaultProviderId);

  /** The conversation sent to the model. */
  const [transcripts, setTranscripts] = useState<string[]>([]);
  /** The rendered transcript. Display only — never sent anywhere. */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** The latest model output. Derived, replaced each turn, never combined. */
  const [state, setState] = useState<ConversationState>(initialConversationState);
  const [search, setSearch] = useState<ContactSearchOutcome>(idleSearchOutcome);

  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [savedMeeting, setSavedMeeting] = useState<SavedMeeting | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  /** Guards a second submit that lands before `isProcessing` has re-rendered. */
  const inFlightRef = useRef(false);

  /**
   * Clears everything, including the log.
   *
   * A hard reset rather than a divider: the point of the control is a fresh start. If
   * it happens while an unsaved meeting form is open, the fresh log opens with a
   * notice — otherwise the form would simply vanish and there would be nothing to say
   * whether the meeting had been written.
   */
  const handleClearChat = useCallback(() => {
    const abandonedMeeting = selectedContactId !== null && savedMeeting === null;

    setMessages(
      abandonedMeeting
        ? [
            {
              id: newMessageId(),
              role: "system",
              tone: "warning",
              text: "Chat cleared before the meeting was saved. Nothing was written to the database.",
            },
          ]
        : [],
    );

    setTranscripts([]);
    setState(initialConversationState);
    setSearch(idleSearchOutcome);
    setSelectedContactId(null);
    setSavedMeeting(null);
    setRequestError(null);
    recorder.resetRecording();
  }, [recorder, selectedContactId, savedMeeting]);

  const handleSubmitTurn = useCallback(async () => {
    const clip = recorder.clip;
    if (clip === null || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsProcessing(true);
    setRequestError(null);

    // Appended before the request so pressing send visibly registers. There is no
    // typed text to echo back here, so without this nothing would acknowledge it.
    const pendingId = newMessageId();
    setMessages((previous) => [
      ...previous,
      {
        id: pendingId,
        role: "user",
        transcript: "",
        transcription: null,
        selectedPosition: null,
        status: "pending",
      },
    ]);

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
        setMessages((previous) => dropMessage(previous, pendingId));
        return;
      }

      if (!response.ok || payload.success === false) {
        // The conversation is deliberately left intact so the user can retry. The
        // pending row goes, though: it never became a turn.
        setRequestError(
          payload.success === false ? payload.error : GENERIC_ERROR_MESSAGE,
        );
        setMessages((previous) => dropMessage(previous, pendingId));
        return;
      }

      // One path for every turn. The criteria always apply; a named position is an
      // extra signal the server has already resolved and validated.
      setMessages((previous) => [
        ...previous.map((message) =>
          message.id === pendingId && message.role === "user"
            ? ({
                ...message,
                transcript: payload.transcript,
                transcription: payload.transcription,
                selectedPosition: payload.selectedPosition,
                status: "done",
              } satisfies UserMessage)
            : message,
        ),
        {
          id: newMessageId(),
          role: "assistant",
          kind: "search",
          search: payload.search,
          selectedContactId: payload.selectedContactId,
          selectionWarning: payload.selectionWarning,
        },
      ]);

      setTranscripts(payload.transcripts);
      setState(payload.state);
      setSearch(payload.search);
      setSelectedContactId(payload.selectedContactId);

      // Clear the clip so the microphone is ready for the next turn.
      recorder.resetRecording();
    } catch {
      setRequestError(
        "We couldn't reach the server. Check your connection and try again.",
      );
      setMessages((previous) => dropMessage(previous, pendingId));
    } finally {
      inFlightRef.current = false;
      setIsProcessing(false);
    }
  }, [providerId, recorder, transcripts, search.contacts, selectedContactId]);

  /**
   * Freezes the form into the log and appends the confirmation.
   *
   * Both are built from the `SavedMeeting` the API echoed back, so the frozen values
   * are what was actually stored rather than what happened to be in the inputs.
   */
  const handleSaved = useCallback((meeting: SavedMeeting) => {
    setSavedMeeting(meeting);
    setMessages((previous) => [
      ...previous,
      { id: newMessageId(), role: "assistant", kind: "submitted", meeting },
      { id: newMessageId(), role: "assistant", kind: "saved", meeting },
    ]);
  }, []);

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

  /**
   * The meeting details as the model currently has them, as one comparable string.
   *
   * Part of the `MeetingForm` key. Value-based rather than identity-based on purpose:
   * `state` is a fresh object every turn, so keying on the object would remount the
   * form after every utterance and discard whatever the user had typed. This changes
   * only when a date, time or purpose actually changes.
   */
  const meetingSignature = `${state.meetingDate}|${state.meetingTime}|${state.notes}`;

  /**
   * The live form, trailing the log rather than inside it.
   *
   * Not a message: it reflects current state and remounts as that state changes,
   * which is the opposite of the append-only history around it. It enters the log
   * only once, frozen, at the moment it is submitted.
   */
  const trailing =
    savedMeeting === null && selectedContact !== null ? (
      <MessageRow align="left">
        <MeetingForm
          key={`meeting-form-${selectedContact.id}-${meetingSignature}`}
          contact={selectedContact}
          state={state}
          onSaved={handleSaved}
          // A lone match renders as a "found" line with no list, so the form has to
          // carry the contact's details itself. With several on screen, the list
          // above already shows the highlighted row.
          showContactDetail={search.contacts.length === 1}
        />
      </MessageRow>
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Settings, pinned above the transcript. The engine applies to the whole
          conversation, so it does not belong beside a single turn, and it is folded
          because it is set once. */}
      <div className="shrink-0 border-b border-slate-200 pb-3 dark:border-slate-800">
        <Disclosure
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
      </div>

      {noProviderConfigured || activeError !== null ? (
        <div className="shrink-0 space-y-2 pt-3">
          {noProviderConfigured ? (
            <Alert tone="info" title="No transcription engine is configured">
              Add an <code>OPENAI_API_KEY</code> or a <code>DEEPGRAM_API_KEY</code>{" "}
              to <code>.env.local</code> and restart the server.
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
              {transcripts.length > 0 ? (
                <p className="mt-2">Your conversation has been kept.</p>
              ) : null}
            </Alert>
          ) : null}
        </div>
      ) : null}

      {/* The only scrolling region. `min-h-0` is what allows it to shrink inside the
          flex column instead of pushing the composer off the viewport. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <MessageList
          messages={messages}
          busy={isProcessing}
          onSelect={setSelectedContactId}
          trailing={trailing}
        />
      </div>

      <div className="shrink-0">
        <Composer
          recorder={recorder}
          busy={isProcessing}
          canSubmit={isProviderAvailable}
          onSubmit={handleSubmitTurn}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Audio is processed on the server and not stored. Anything you don&apos;t
            say stays empty rather than being guessed.
          </p>

          {messages.length > 0 || transcripts.length > 0 ? (
            <Button
              variant="ghost"
              onClick={handleClearChat}
              disabled={isProcessing}
            >
              Clear chat
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Removes a message that never became a turn, after a failed request. */
function dropMessage(
  messages: readonly ChatMessage[],
  id: string,
): ChatMessage[] {
  return messages.filter((message) => message.id !== id);
}
