"use client";

import { useCallback, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  formatGender,
  formatMeetingDate,
  formatMeetingTime,
  maskPhone,
} from "@/lib/format";
import type { ContactCandidate } from "@/lib/matching/contact-match";
import { MeetingSubmissionSchema } from "@/schemas/meeting-submission";
import type { ConversationState } from "@/schemas/meeting-request";
import type { CreateMeetingResponse, SavedMeeting } from "@/types/api";

type MeetingFormProps = {
  contact: ContactCandidate;
  /** Accumulated state; supplies the initial date, time and description. */
  state: ConversationState;
  onSaved: (meeting: SavedMeeting) => void;
  /**
   * Whether to name the contact in full at the top of the form.
   *
   * True when the search returned exactly one match, because that turn's message
   * shows a plain "found" line rather than a selectable list, leaving nowhere else
   * for the contact's details to appear before a write.
   */
  showContactDetail: boolean;
};

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-indigo-500 disabled:opacity-60 " +
  "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

/**
 * Final confirmation before the only write in the application.
 *
 * Shows the chosen contact alongside the meeting details, all editable. The
 * `meetings` table declares date, time and description NOT NULL, so anything the
 * conversation never supplied has to be filled in here — the "never guess" rule
 * resolving at the human step rather than with a silent default.
 */
export function MeetingForm({
  contact,
  state,
  onSaved,
  showContactDetail,
}: MeetingFormProps) {
  const [date, setDate] = useState(state.meetingDate);
  const [time, setTime] = useState(state.meetingTime);
  const [description, setDescription] = useState(state.notes);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // These are seeded from `state` on mount and never synced by an effect. The parent
  // keys this component on the contact id *and* the meeting details, so a new
  // selection or a newly spoken date, time or purpose remounts it and re-reads the
  // initial values. That is the documented way to reset state on a prop change, and
  // it avoids the cascading render an effect-based reset would cause.
  //
  // The consequence is that a later turn changing any of the three replaces all
  // three, typing included. That is the intended precedence: the conversation is the
  // source of truth for these values, and this form is a confirmation step for what
  // the conversation produced rather than an independent editor.

  const validation = useMemo(
    () =>
      MeetingSubmissionSchema.safeParse({
        userId: contact.id,
        date,
        time,
        description,
      }),
    [contact.id, date, time, description],
  );

  /**
   * Which of the three are still blank, in field order.
   *
   * Named rather than counted, so the notice can say exactly what is outstanding
   * instead of only that something is.
   */
  const missing = useMemo(
    () =>
      [
        date.trim() === "" ? "a date" : null,
        time.trim() === "" ? "a time" : null,
        description.trim() === "" ? "a purpose" : null,
      ].filter((item): item is string => item !== null),
    [date, time, description],
  );

  /**
   * Nothing incomplete can be submitted, so the button is gated on the same Zod parse
   * that builds the request body.
   *
   * Note what this removes: the form used to reveal per-field errors on a failed
   * submit attempt. With the button disabled, that attempt can never happen, so the
   * mechanism was unreachable. The requirement is stated up front instead — a
   * standing notice plus a "Required" hint under each blank field — which is
   * information the user can act on before pressing anything.
   */
  const canSubmit = validation.success && !isSaving;

  const handleSubmit = useCallback(async () => {
    // Still guarded, not merely disabled: a disabled attribute is a UI affordance,
    // and this is the only path that writes to the database.
    if (!validation.success || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      const payload = (await response.json()) as CreateMeetingResponse;

      if (!response.ok || payload.success === false) {
        setSaveError(
          payload.success === false
            ? payload.error
            : "We couldn't save that meeting. Please try again.",
        );
        return;
      }

      onSaved(payload.meeting);
    } catch {
      setSaveError(
        "We couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSaved, validation]);

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
        {showContactDetail
          ? "Confirm and schedule"
          : `Confirm and schedule with ${contact.label}`}
      </p>

      {/*
        Who the row will be written for.
        
        Shown only when the message above has no list to point at — a lone match is
        rendered there as a plain "found" line, so without this the contact's details
        would appear nowhere before a database write. When several matched, that list
        is on screen with the chosen row highlighted, and repeating it here would be
        a third copy of the same person.
      */}
      {showContactDetail ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Meeting with
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {contact.label}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {contact.city}
            {contact.state !== "" ? `, ${contact.state}` : ""} · {contact.email}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {maskPhone(contact.phoneNumber)}
            {` · ${formatGender(contact.gender)}`}
            {contact.score < 1
              ? ` · ${Math.round(contact.score * 100)}% match`
              : " · exact match"}
          </p>
          {/* There is no "change" control here because there is nothing to change to.
              Naming the way out keeps that from reading as an omission. */}
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-500">
            The only contact that matched. Speak again to search for someone else.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Worded for both ways a field ends up blank: never spoken, or cleared by
            hand. The old copy said "the conversation didn't mention…", which was
            wrong the moment someone emptied a field themselves. Referenced by the
            submit button, so a screen reader reaches the reason it is disabled. */}
        {missing.length > 0 ? (
          <p
            id="meeting-missing"
            className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Date, time and purpose are all required. Still needed:{" "}
            {missing.join(", ")}.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="meeting-date"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Date
            </label>
            <input
              id="meeting-date"
              type="date"
              required
              aria-required="true"
              value={date}
              disabled={isSaving}
              onChange={(event) => setDate(event.target.value)}
              className={`mt-1 ${FIELD_CLASSES}`}
              aria-describedby="meeting-date-hint"
            />
            <p
              id="meeting-date-hint"
              className={
                date === ""
                  ? "mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                  : "mt-1 text-xs text-slate-500 dark:text-slate-400"
              }
            >
              {date === "" ? "Required" : formatMeetingDate(date)}
            </p>
          </div>

          <div>
            <label
              htmlFor="meeting-time"
              className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Time
            </label>
            <input
              id="meeting-time"
              type="time"
              required
              aria-required="true"
              value={time}
              disabled={isSaving}
              onChange={(event) => setTime(event.target.value)}
              className={`mt-1 ${FIELD_CLASSES}`}
              aria-describedby="meeting-time-hint"
            />
            <p
              id="meeting-time-hint"
              className={
                time === ""
                  ? "mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                  : "mt-1 text-xs text-slate-500 dark:text-slate-400"
              }
            >
              {time === "" ? "Required" : formatMeetingTime(time)}
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="meeting-description"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Notes
          </label>
          <textarea
            id="meeting-description"
            rows={4}
            required
            aria-required="true"
            value={description}
            disabled={isSaving}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this meeting about?"
            className={`mt-1 resize-y ${FIELD_CLASSES}`}
            aria-describedby="meeting-description-hint"
          />
          {/* This field had no hint at all, so it was the one that could look
              optional. Whitespace counts as blank, matching the schema's `.trim()`. */}
          <p
            id="meeting-description-hint"
            className={
              description.trim() === ""
                ? "mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                : "mt-1 text-xs text-slate-500 dark:text-slate-400"
            }
          >
            {description.trim() === ""
              ? "Required"
              : `${description.trim().length} characters`}
          </p>
        </div>

        {saveError !== null ? (
          <Alert tone="error" title="Couldn't save">
            {saveError}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {/* Labelled with the side effect rather than a generic "Submit".
              `aria-describedby` points at the outstanding-fields notice, so the
              reason it is unavailable is reachable rather than left to be guessed. */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-describedby={missing.length > 0 ? "meeting-missing" : undefined}
          >
            {isSaving ? "Saving…" : "Schedule meeting"}
          </Button>

          <span
            role="status"
            aria-live="polite"
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            {isSaving
              ? "Saving…"
              : missing.length > 0
                ? `Add ${missing.join(", ")} to enable scheduling.`
                : null}
          </span>
        </div>
      </div>
    </div>
  );
}
