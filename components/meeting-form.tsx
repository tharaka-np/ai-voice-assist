"use client";

import { useCallback, useMemo, useState } from "react";

import { UserPicker } from "@/components/user-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMeetingDate, formatMeetingTime } from "@/lib/format";
import type {
  ResolutionStatus,
  UserCandidate,
} from "@/lib/matching/name-match";
import { MeetingSubmissionSchema } from "@/schemas/meeting-submission";
import type {
  CreateMeetingResponse,
  NameMatchMeta,
  SavedMeeting,
} from "@/types/api";
import type { MeetingInfo } from "@/schemas/meeting";

type MeetingFormProps = {
  /** What the model proposed. Used only as initial values. */
  proposed: MeetingInfo;
  nameMatch: NameMatchMeta;
  onSaved: (meeting: SavedMeeting) => void;
};

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-indigo-500 disabled:opacity-60 " +
  "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

/**
 * The confirmation step: review, correct, then save.
 *
 * Every proposed value is editable, and nothing is written until the user
 * submits. Date and time are required because `meetings` declares them NOT NULL,
 * so a recording that never stated a time has to be completed here — which is
 * the "never guess" rule resolving at the human step rather than with a default.
 */
export function MeetingForm({ proposed, nameMatch, onSaved }: MeetingFormProps) {
  const [candidates, setCandidates] = useState<UserCandidate[]>(
    nameMatch.candidates,
  );
  const [status, setStatus] = useState<ResolutionStatus>(nameMatch.status);
  const [userId, setUserId] = useState<number | null>(nameMatch.selectedUserId);

  const [date, setDate] = useState(proposed.meetingDate ?? "");
  const [time, setTime] = useState(proposed.meetingTime ?? "");
  const [description, setDescription] = useState(proposed.notes ?? "");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  // Note: there is deliberately no effect syncing these fields back to
  // `proposed`. The parent gives this component a `key` that changes on every
  // extraction, so React remounts it and the initial state above is re-read.
  // That is the documented way to reset state when a prop changes, and it avoids
  // the cascading render an effect-based reset would cause.

  const validation = useMemo(
    () => MeetingSubmissionSchema.safeParse({ userId, date, time, description }),
    [userId, date, time, description],
  );

  /** Field errors, surfaced only after a submit attempt to avoid nagging. */
  const fieldErrors = useMemo(() => {
    if (validation.success || !showValidation) return {};

    const errors: Record<string, string> = {};
    for (const issue of validation.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return errors;
  }, [showValidation, validation]);

  const handleCandidatesReplaced = useCallback(
    (
      nextCandidates: UserCandidate[],
      nextSelected: number | null,
      nextStatus: ResolutionStatus,
    ) => {
      setCandidates(nextCandidates);
      setStatus(nextStatus);
      setUserId(nextSelected);
    },
    [],
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

  const selectedLabel = candidates.find(
    (candidate) => candidate.id === userId,
  )?.label;

  return (
    <Card>
      <CardTitle hint="Step 2">Review and save</CardTitle>

      <div className="space-y-5">
        <UserPicker
          status={status}
          candidates={candidates}
          selectedUserId={userId}
          searchedFor={nameMatch.searchedFor}
          disabled={isSaving}
          onSelect={setUserId}
          onCandidatesReplaced={handleCandidatesReplaced}
        />

        {fieldErrors.userId !== undefined ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {fieldErrors.userId}
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
                {formatMeetingDate(date === "" ? null : date) ??
                  "Not mentioned — please fill this in"}
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
                {formatMeetingTime(time === "" ? null : time) ??
                  "Not mentioned — please fill this in"}
              </p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="meeting-description"
            className="block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Description
          </label>
          <textarea
            id="meeting-description"
            rows={4}
            value={description}
            disabled={isSaving}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What was this meeting about?"
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
          {/* Labelled with the side effect rather than a generic "Submit", so
              what is about to happen is obvious before the click. */}
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving
              ? "Saving…"
              : selectedLabel === undefined
                ? "Save meeting"
                : `Save meeting for ${selectedLabel}`}
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
