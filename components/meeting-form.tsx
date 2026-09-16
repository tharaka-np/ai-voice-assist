"use client";

import { useCallback, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMeetingDate, formatMeetingTime, maskPhone } from "@/lib/format";
import type { ContactCandidate } from "@/lib/matching/contact-match";
import { MeetingSubmissionSchema } from "@/schemas/meeting-submission";
import type { ConversationState } from "@/schemas/meeting-request";
import type { CreateMeetingResponse, SavedMeeting } from "@/types/api";

type MeetingFormProps = {
  contact: ContactCandidate;
  /** Accumulated state; supplies the initial date, time and description. */
  state: ConversationState;
  onSaved: (meeting: SavedMeeting) => void;
  onChangeContact: () => void;
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
  onChangeContact,
}: MeetingFormProps) {
  const [date, setDate] = useState(state.meetingDate);
  const [time, setTime] = useState(state.meetingTime);
  const [description, setDescription] = useState(state.notes);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  // No effect syncs these back to `state`: the parent keys this component on the
  // contact id, so a different selection remounts it and re-reads the initial
  // values. That is the documented way to reset state on a prop change and avoids
  // the cascading render an effect-based reset would cause.

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

  /** Surfaced only after a submit attempt, so the form does not nag while typing. */
  const fieldErrors = useMemo(() => {
    if (validation.success || !showValidation) return {};

    const errors: Record<string, string> = {};
    for (const issue of validation.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return errors;
  }, [showValidation, validation]);

  const missingCount = useMemo(
    () => [date, time, description].filter((value) => value.trim() === "").length,
    [date, time, description],
  );

  const handleSubmit = useCallback(async () => {
    setShowValidation(true);

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
    <Card>
      <CardTitle hint="Final step">Confirm and schedule</CardTitle>

      <div className="space-y-5">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                Selected contact
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {contact.label}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {contact.city}
                {contact.state !== "" ? `, ${contact.state}` : ""} ·{" "}
                {contact.email} · {maskPhone(contact.phoneNumber)}
              </p>
            </div>

            <button
              type="button"
              onClick={onChangeContact}
              disabled={isSaving}
              className="text-xs font-medium text-indigo-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-400"
            >
              Change
            </button>
          </div>
        </div>

        {missingCount > 0 && !showValidation ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The conversation didn&apos;t mention{" "}
            {[
              date.trim() === "" ? "a date" : null,
              time.trim() === "" ? "a time" : null,
              description.trim() === "" ? "a purpose" : null,
            ]
              .filter((item): item is string => item !== null)
              .join(" or ")}
            . Fill that in before scheduling.
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
              value={date}
              disabled={isSaving}
              onChange={(event) => setDate(event.target.value)}
              className={`mt-1 ${FIELD_CLASSES}`}
              aria-invalid={fieldErrors.date !== undefined}
              aria-describedby={
                fieldErrors.date !== undefined ? "meeting-date-error" : undefined
              }
            />
            {fieldErrors.date !== undefined ? (
              <p
                id="meeting-date-error"
                role="alert"
                className="mt-1 text-xs text-rose-600 dark:text-rose-400"
              >
                {fieldErrors.date}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {date === "" ? "Required" : formatMeetingDate(date)}
              </p>
            )}
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
              value={time}
              disabled={isSaving}
              onChange={(event) => setTime(event.target.value)}
              className={`mt-1 ${FIELD_CLASSES}`}
              aria-invalid={fieldErrors.time !== undefined}
              aria-describedby={
                fieldErrors.time !== undefined ? "meeting-time-error" : undefined
              }
            />
            {fieldErrors.time !== undefined ? (
              <p
                id="meeting-time-error"
                role="alert"
                className="mt-1 text-xs text-rose-600 dark:text-rose-400"
              >
                {fieldErrors.time}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {time === "" ? "Required" : formatMeetingTime(time)}
              </p>
            )}
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
            value={description}
            disabled={isSaving}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this meeting about?"
            className={`mt-1 resize-y ${FIELD_CLASSES}`}
            aria-invalid={fieldErrors.description !== undefined}
            aria-describedby={
              fieldErrors.description !== undefined
                ? "meeting-description-error"
                : undefined
            }
          />
          {fieldErrors.description !== undefined ? (
            <p
              id="meeting-description-error"
              role="alert"
              className="mt-1 text-xs text-rose-600 dark:text-rose-400"
            >
              {fieldErrors.description}
            </p>
          ) : null}
        </div>

        {saveError !== null ? (
          <Alert tone="error" title="Couldn't save">
            {saveError}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {/* Labelled with the side effect rather than a generic "Submit". */}
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving…" : `Schedule meeting with ${contact.label}`}
          </Button>

          <span
            role="status"
            aria-live="polite"
            className="text-sm text-slate-500 dark:text-slate-400"
          >
            {isSaving ? "Saving…" : null}
          </span>
        </div>
      </div>
    </Card>
  );
}
