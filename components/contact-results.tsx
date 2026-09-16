"use client";

import type { ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatGender, maskPhone } from "@/lib/format";
import type { ContactSearchOutcome } from "@/lib/matching/contact-match";
import { FIELD_LABELS, type ContactField } from "@/schemas/meeting-request";

type ContactResultsProps = {
  search: ContactSearchOutcome;
  selectedContactId: number | null;
  busy: boolean;
  onSelect: (contactId: number) => void;
  /**
   * The capture controls for the next turn, rendered under the list.
   *
   * Passed in rather than built here so this component stays presentational and
   * knows nothing about recording. Null on the first turn, when the controls live in
   * the card above instead.
   */
  footer?: ReactNode;
};

function matchCountLabel(total: number): string {
  if (total === 1) return "1 possible match found";
  return `${total} possible matches found`;
}

/** Names the fields still available, so the refinement prompt is actionable. */
function suggestionsFor(matchedFields: readonly ContactField[]): string {
  const remaining = (
    ["lname", "city", "email", "phoneNumber", "street", "state", "gender"] as const
  ).filter((field) => !matchedFields.includes(field));

  return remaining.map((field) => FIELD_LABELS[field].toLowerCase()).join(", ");
}

/**
 * Match count, refinement prompt, and the contact rows with the current choice
 * marked on it.
 *
 * The threshold arrives from the server rather than being hardcoded here, so
 * changing `MATCH_THRESHOLD` needs no UI edit.
 *
 * Rows are selectable in every mode that has rows, `refine` included. They were
 * once read-only there, on the reasoning that picking from a truncated list invites
 * picking the wrong person. That reasoning did not survive contact with the rest of
 * the app: the API honours a spoken position whatever the mode, and this card openly
 * invites one. So a user could say "select the third one" while refining, have it
 * work, and see nothing change here — and then be unable to correct it by clicking.
 * Speaking and clicking now do the same thing, and the refinement guidance stays
 * visible either way.
 */
export function ContactResults({
  search,
  selectedContactId,
  busy,
  onSelect,
  footer = null,
}: ContactResultsProps) {
  if (search.mode === "idle") return null;

  if (search.mode === "empty") {
    return (
      <Alert tone="info" title="No matching contacts found">
        Try changing or removing one of the search details. You can also speak
        again to add something different, or start over.
      </Alert>
    );
  }

  const isRefining = search.mode === "refine";
  const matchedFields = search.contacts[0]?.matchedFields ?? [];

  // The position of the current choice, or 0 for none. Derived from the list rather
  // than tracked separately, so it cannot disagree with what is rendered.
  const selectedPosition =
    search.contacts.findIndex((contact) => contact.id === selectedContactId) + 1;

  return (
    <Card>
      <CardTitle
        hint={
          selectedPosition > 0
            ? `#${selectedPosition} selected`
            : isRefining
              ? `Threshold is ${search.threshold}`
              : "Pick the right person"
        }
      >
        {matchCountLabel(search.total)}
      </CardTitle>

      {/* Only while the choice is still open. Once someone is selected the warning
          has nothing left to ask for — the user has answered the question it was
          posing, and leaving it up reads as an unresolved problem. */}
      {isRefining && selectedPosition === 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Too many matches to choose from.</p>
          <p className="mt-1">
            Add another detail such as {suggestionsFor(matchedFields)}, then record
            again below. Or pick a row if you already know which is right.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {search.contacts.map((contact, index) => {
          const isSelected = contact.id === selectedContactId;
          const position = index + 1;

          return (
            <li key={contact.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  isSelected
                    ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800",
                  busy && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="selected-contact"
                  value={contact.id}
                  checked={isSelected}
                  disabled={busy}
                  onChange={() => onSelect(contact.id)}
                  className="mt-1 size-4 shrink-0 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                />

                <span className="min-w-0 flex-1">
                  {/* The number a user can speak, so "select the third one" always
                      refers to something on screen. */}
                  <span className="mr-1.5 text-sm font-medium tabular-nums text-slate-400 dark:text-slate-500">
                    {position}.
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {contact.label}
                    </span>
                    {/* Text, not colour alone: the radio carries this for assistive
                        tech, and this carries it for everyone scanning the list. */}
                    {isSelected ? (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-indigo-500">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-slate-600 dark:text-slate-400">
                    {contact.city}
                    {contact.state !== "" ? `, ${contact.state}` : ""}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {contact.email}
                  </span>
                  {/* `gender` is NOT NULL on the row, so it is always present here —
                      unlike the conversation state, where "" means "not stated". */}
                  <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                    {maskPhone(contact.phoneNumber)}
                    {` · ${formatGender(contact.gender)}`}
                    {contact.score < 1
                      ? ` · ${Math.round(contact.score * 100)}% match`
                      : " · exact match"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {search.contacts.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Pick one above, or say{" "}
          <span className="font-medium">&ldquo;select the third one&rdquo;</span>.
          {/* Deliberately not offered as a way to select: a description like "the
              Colombo one" is read as a search detail, which narrows the list
              instead. That reaches the same person without guessing. */}
          {isRefining
            ? " Adding a detail such as “she’s in Colombo” narrows the list instead."
            : null}
        </p>
      ) : null}

      {search.total > search.contacts.length ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Showing the closest {search.contacts.length} of {search.total}.
        </p>
      ) : null}

      {footer !== null ? (
        <div className="mt-5 border-t border-slate-200 pt-5 dark:border-slate-800">
          <h3 className="mb-3 text-sm font-medium text-slate-900 dark:text-slate-100">
            Add more details
          </h3>
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
