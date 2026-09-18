"use client";

import { CheckIcon } from "@/components/icons";
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
  /**
   * False for every turn but the newest.
   *
   * A correctness rule, not a style: an older list reflects criteria that have since
   * changed, so picking from it would apply a choice against a stale set of rows.
   * Frozen turns render a one-line summary instead of radio buttons.
   */
  interactive: boolean;
};

/**
 * Above this many rows, a finished turn's list folds behind a disclosure.
 *
 * Five fits without crowding the turns around it. The display cap is 25, and 25 rows
 * of history between two spoken turns would bury the conversation.
 */
const FOLD_FROZEN_ROWS_ABOVE = 5;

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
 * The search result for one turn, as an assistant message.
 *
 * Carries no card chrome of its own — the message wrapper supplies it — so this is
 * only the content.
 *
 * Rows are selectable in every mode that has them, `refine` included. They were once
 * read-only there, on the reasoning that picking from a truncated list invites picking
 * the wrong person. That did not survive contact with the rest of the app: the API
 * honours a spoken position whatever the mode, so a user could say "select the third
 * one" while refining, have it work, and see nothing change here.
 */
export function ContactResults({
  search,
  selectedContactId,
  busy,
  onSelect,
  interactive,
}: ContactResultsProps) {
  if (search.mode === "idle") {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        I didn&apos;t catch a name to search for. Try saying who you&apos;re looking
        for.
      </p>
    );
  }

  if (search.mode === "empty") {
    return (
      <div className="text-sm">
        <p className="font-medium text-slate-900 dark:text-slate-100">
          No matching contacts found
        </p>
        {/* The advice belongs to the live turn only. Once later turns have scrolled
            past, telling the user to change a detail they already changed is noise. */}
        {interactive ? (
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Try changing or removing one of the details, or clear the chat to start
            again.
          </p>
        ) : null}
      </div>
    );
  }

  const isRefining = search.mode === "refine";

  // Derived from the list rather than tracked separately, so the badge cannot
  // disagree with what is rendered. 0 means nothing selected.
  const selectedIndex = search.contacts.findIndex(
    (contact) => contact.id === selectedContactId,
  );
  const selectedContact =
    selectedIndex === -1 ? null : search.contacts[selectedIndex];

  const radioRows = (
    <RadioRows
      search={search}
      selectedContactId={selectedContactId}
      busy={busy}
      onSelect={onSelect}
      isRefining={isRefining}
    />
  );

  // A finished turn keeps its rows, read-only.
  //
  // Compact rather than the full row: name and place answer "who was on offer", while
  // email, phone, gender and score answered a question the user has already finished
  // asking. At roughly a quarter of the height it costs, a six-turn conversation stays
  // scrollable.
  //
  // Note what is *not* repeated here: a position number. The header used to read "you
  // chose #1" while the user's own message said "chose #2" — both true, because one
  // counts against the list on screen when they spoke and the other against the list
  // this turn returned. Marking the row in place says it without the contradiction.
  if (!interactive) {
    const rows = (
      <ul
        // States the constraint for assistive tech; sighted users get it from the
        // absent radios and the muted treatment.
        aria-label="Matches from an earlier turn, no longer selectable"
        className="mt-2 space-y-0.5"
      >
        {search.contacts.map((contact, index) => {
          const wasChosen = contact.id === selectedContactId;

          return (
            <li
              key={contact.id}
              className={cn(
                "flex items-baseline gap-2 rounded-md px-2 py-1 text-xs",
                wasChosen
                  ? "bg-emerald-50 dark:bg-emerald-950/40"
                  : "text-slate-500 dark:text-slate-400",
              )}
            >
              <span className="w-4 shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                {index + 1}.
              </span>

              <span
                className={cn(
                  "min-w-0 truncate",
                  wasChosen
                    ? "font-medium text-slate-900 dark:text-slate-100"
                    : "text-slate-600 dark:text-slate-400",
                )}
              >
                {contact.label}
              </span>

              <span className="min-w-0 truncate text-slate-500 dark:text-slate-500">
                {placeOf(contact)}
              </span>

              {/* Settled green rather than the live list's indigo, so a past choice
                  never looks like a control waiting to be used. */}
              {wasChosen ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckIcon className="size-3" />
                  Chosen
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );

    return (
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {matchCountLabel(search.total)}
          </span>
          {selectedContact !== null
            ? ` · you chose ${selectedContact.label}`
            : isRefining
              ? " · asked for another detail"
              : ""}
        </p>

        {/* A long list folds, so one turn cannot dominate the scroll. */}
        {search.contacts.length > FOLD_FROZEN_ROWS_ABOVE ? (
          <Disclosure
            className="mt-1"
            summaryClassName="px-2 py-1 text-xs text-slate-500 dark:text-slate-400"
            summary={<span>Show all {search.contacts.length} matches</span>}
          >
            {rows}
          </Disclosure>
        ) : (
          rows
        )}

        {search.total > search.contacts.length ? (
          <p className="mt-1 px-2 text-[11px] text-slate-500 dark:text-slate-400">
            Closest {search.contacts.length} of {search.total}.
          </p>
        ) : null}
      </div>
    );
  }

  /*
   * A settled choice states itself; it does not ask again.
   *
   * Reached when a position was spoken, a row was clicked, or a lone match was
   * auto-selected. Radio buttons here would be asking a question the user has already
   * answered, and a radio group of one — the lone-match case — has no alternatives at
   * all. The contact's details belong to the meeting form below, which is the step
   * that acts on them.
   *
   * No position number in this line, deliberately. It would count against *this*
   * turn's results, while the user's own message counts against the list that was on
   * screen when they spoke. Those disagree whenever a turn re-ranks the list, which is
   * exactly what produced a "#1 selected" label under a "chose #2" message.
   */
  const settled = selectedContact ?? (search.contacts.length === 1 ? search.contacts[0] : null);

  if (settled !== null) {
    return (
      <div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span
            aria-hidden="true"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500"
          >
            <CheckIcon className="size-2.5" />
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            {selectedContact !== null ? "Selected" : "Found"}
          </span>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {settled.label}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {placeOf(settled)}
            {settled.score < 1
              ? ` · ${Math.round(settled.score * 100)}% match`
              : null}
          </span>
        </p>

        {/*
          No alternatives offered here, deliberately.
          
          The choice is made and the next step — the meeting form — is directly below,
          so a list of rejected candidates only competes with it. Changing is spoken
          instead: another position, or a detail that narrows the search.
          
          The cost is that the numbered rows are no longer on this message. Positions
          still resolve correctly, because the request carries the real candidate list
          whatever is rendered, and the earlier message keeps its numbered rows. They
          can drift apart if a later turn narrows the search while this selection is
          carried, since that list would then be visible nowhere.
        */}
        {search.contacts.length > 1 ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Say another position to switch, or add a detail to search again.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {matchCountLabel(search.total)}
        </p>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isRefining ? `Threshold is ${search.threshold}` : "Pick the right person"}
        </span>
      </div>

      {isRefining ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Too many matches to choose from.</p>
          <p className="mt-0.5">
            Add another detail such as{" "}
            {suggestionsFor(search.contacts[0]?.matchedFields ?? [])}, then record
            again. Or pick a row if you already know which is right.
          </p>
        </div>
      ) : null}

      {radioRows}
    </div>
  );
}

/** Extracted so the settled view can offer the same rows behind "Change". */
function RadioRows({
  search,
  selectedContactId,
  busy,
  onSelect,
  isRefining,
}: {
  search: ContactSearchOutcome;
  selectedContactId: number | null;
  busy: boolean;
  onSelect: (contactId: number) => void;
  isRefining: boolean;
}) {
  return (
    <div>
      <ul className="space-y-2">
        {search.contacts.map((contact, index) => {
          const isSelected = contact.id === selectedContactId;

          return (
            <li key={contact.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 transition-colors motion-reduce:transition-none",
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-indigo-500">
                        <CheckIcon className="size-3" />
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

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Pick one above, or say{" "}
        <span className="font-medium">&ldquo;select the third one&rdquo;</span>.
        {/* Deliberately not offered as a way to select: a description like "the
            Colombo one" is read as a search detail, which narrows the list instead. */}
        {isRefining
          ? " Adding a detail such as “she’s in Colombo” narrows the list instead."
          : null}
      </p>

      {search.total > search.contacts.length ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Showing the closest {search.contacts.length} of {search.total}.
        </p>
      ) : null}
    </div>
  );
}
