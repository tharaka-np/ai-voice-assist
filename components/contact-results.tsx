"use client";

import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/cn";
import { formatGender, maskPhone } from "@/lib/format";
import type {
  ContactCandidate,
  ContactSearchOutcome,
} from "@/lib/matching/contact-match";
import { FIELD_LABELS, type ContactField } from "@/schemas/meeting-request";

type ContactResultsProps = {
  search: ContactSearchOutcome;
  selectedContactId: number | null;
  busy: boolean;
  onSelect: (contactId: number) => void;
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

function placeOf(contact: ContactCandidate): string {
  return contact.state !== ""
    ? `${contact.city}, ${contact.state}`
    : contact.city;
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
 *
 * Once someone is selected the list collapses to a single line. That is where most
 * of the page's height went: a four-row list plus the meeting form below it did not
 * fit one screen, and the rows have served their purpose the moment a choice is made.
 * They stay one click away, and the collapsed line names who is chosen, so nothing is
 * hidden — only folded.
 */
export function ContactResults({
  search,
  selectedContactId,
  busy,
  onSelect,
}: ContactResultsProps) {
  if (search.mode === "idle") return null;

  if (search.mode === "empty") {
    return (
      <Alert tone="info" title="No matching contacts found">
        Try changing or removing one of the search details. You can also speak again
        to add something different, or start over.
      </Alert>
    );
  }

  const isRefining = search.mode === "refine";

  // The position of the current choice, or 0 for none. Derived from the list rather
  // than tracked separately, so it cannot disagree with what is rendered.
  const selectedIndex = search.contacts.findIndex(
    (contact) => contact.id === selectedContactId,
  );
  const selectedPosition = selectedIndex + 1;
  const selectedContact =
    selectedIndex === -1 ? null : search.contacts[selectedIndex];

  const rows = (
    <ul className="space-y-2">
      {search.contacts.map((contact, index) => {
        const isSelected = contact.id === selectedContactId;

        return (
          <li key={contact.id}>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none",
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
                <span className="flex flex-wrap items-center gap-x-2">
                  {/* The number a user can speak, so "select the third one" always
                      refers to something on screen. */}
                  <span className="text-sm font-medium tabular-nums text-slate-400 dark:text-slate-500">
                    {index + 1}.
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {contact.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {placeOf(contact)}
                  </span>
                  {/* Text, not colour alone: the radio carries this for assistive
                      tech, and this carries it for everyone scanning the list. */}
                  {isSelected ? (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-indigo-500">
                      Selected
                    </span>
                  ) : null}
                </span>

                <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                  {contact.email} · {maskPhone(contact.phoneNumber)}
                  {/* `gender` is NOT NULL on the row, so it is always present here —
                      unlike the conversation state, where "" means "not stated". */}
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
  );

  const trailingNote = (
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
      Pick one above, or say{" "}
      <span className="font-medium">&ldquo;select the third one&rdquo;</span>.
      {/* Deliberately not offered as a way to select: a description like "the
          Colombo one" is read as a search detail, which narrows the list instead.
          That reaches the same person without guessing. */}
      {isRefining
        ? " Adding a detail such as “she’s in Colombo” narrows the list instead."
        : null}
    </p>
  );

  const overflowNote =
    search.total > search.contacts.length ? (
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Showing the closest {search.contacts.length} of {search.total}.
      </p>
    ) : null;

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
      {isRefining && selectedContact === null ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Too many matches to choose from.</p>
          <p className="mt-1">
            Add another detail such as {suggestionsFor(search.contacts[0]?.matchedFields ?? [])}
            , then record again. Or pick a row if you already know which is right.
          </p>
        </div>
      ) : null}

      {selectedContact !== null ? (
        <Disclosure
          summaryClassName="-m-1 p-1"
          summary={
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white dark:bg-indigo-500"
              >
                ✓
              </span>
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {selectedPosition}. {selectedContact.label}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {" · "}
                  {placeOf(selectedContact)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {search.contacts.length > 1
                  ? `Change · ${search.contacts.length} matches`
                  : "Change"}
              </span>
            </span>
          }
        >
          {rows}
          {trailingNote}
          {overflowNote}
        </Disclosure>
      ) : (
        <>
          {rows}
          {trailingNote}
          {overflowNote}
        </>
      )}
    </Card>
  );
}
