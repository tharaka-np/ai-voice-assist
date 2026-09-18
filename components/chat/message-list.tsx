"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { MessageRow } from "@/components/chat/message-row";
import { SubmittedMeeting } from "@/components/chat/submitted-meeting";
import { SystemNotice } from "@/components/chat/system-notice";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { UserMessage } from "@/components/chat/user-message";
import { isLatestSearch, type ChatMessage } from "@/components/chat/types";
import { ContactResults } from "@/components/contact-results";
import { MicIcon } from "@/components/icons";
import { SavedMeetingCard } from "@/components/saved-meeting";

type MessageListProps = {
  messages: ChatMessage[];
  /** Locks the interactive rows while a turn is in flight. */
  busy: boolean;
  onSelect: (contactId: number) => void;
  /** The live meeting form, when there is one. Trailing, not part of the log. */
  trailing: ReactNode;
};

/**
 * The scrolling transcript.
 *
 * Owns auto-scroll, keyed on message count rather than on the array identity: the
 * pending message is patched in place when its transcript arrives, and re-scrolling
 * for that would fight a user who had just scrolled up to re-read something.
 *
 * `aria-live="polite"` on the log rather than on each message, so a new turn is
 * announced once, as an addition to a conversation.
 */
export function MessageList({
  messages,
  busy,
  onSelect,
  trailing,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const count = messages.length;

  useEffect(() => {
    // Not a state update, so this does not trip the cascading-render rule the rest of
    // this codebase avoids effects for.
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [count, busy]);

  // `!busy` matters: a turn in flight must show progress, never the prompt to start
  // one. The optimistic user message means an empty log while busy shouldn't happen,
  // but relying on that would make this correct only by coincidence.
  if (count === 0 && trailing === null && !busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span
          aria-hidden="true"
          className="mb-4 flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
        >
          <MicIcon className="size-6" />
        </span>

        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Describe who you are looking for
        </p>
        <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
          Tap the microphone and say a name. You can add the meeting in the same
          breath, or in a later turn — anything you leave out stays empty rather than
          being guessed.
        </p>

        <div className="mt-4 w-full max-w-md space-y-2">
          {[
            "Find Amanda Wilson in Austin.",
            "Schedule a meeting on September 20th, 2026 at 2 PM to discuss the Spice CRM release.",
          ].map((example) => (
            <p
              key={example}
              className="rounded-xl bg-slate-100 px-3 py-2 text-left text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
            >
              &ldquo;{example}&rdquo;
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className="space-y-3"
    >
      {messages.map((message) => {
        if (message.role === "user") {
          return <UserMessage key={message.id} message={message} />;
        }

        if (message.role === "system") {
          return <SystemNotice key={message.id} message={message} />;
        }

        if (message.kind === "search") {
          return (
            <MessageRow key={message.id} align="left">
              <ContactResults
                search={message.search}
                selectedContactId={message.selectedContactId}
                busy={busy}
                onSelect={onSelect}
                interactive={isLatestSearch(messages, message.id)}
              />

              {/* Kept with the turn it belongs to. It explains why a position was
                  not applied, which stops making sense once later turns scroll past. */}
              {message.selectionWarning !== null ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  {message.selectionWarning} Everything else from that sentence was
                  kept.
                </p>
              ) : null}
            </MessageRow>
          );
        }

        if (message.kind === "submitted") {
          return (
            <MessageRow key={message.id} align="left">
              <SubmittedMeeting meeting={message.meeting} />
            </MessageRow>
          );
        }

        return (
          <MessageRow
            key={message.id}
            align="left"
            className="border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <SavedMeetingCard meeting={message.meeting} />
          </MessageRow>
        );
      })}

      {busy ? <TypingIndicator /> : null}

      {trailing}

      {/* Scroll anchor. Empty on purpose. */}
      <div ref={endRef} />
    </div>
  );
}
