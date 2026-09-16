"use client";

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
 * Match count, refinement prompt and — once the list is short enough — the
 * selectable contact cards.
 *
 * The threshold arrives from the server rather than being hardcoded here, so
 * changing `MATCH_THRESHOLD` needs no UI edit.
 *
 * In refinement mode the rows are still previewed but not selectable. Showing who
 * is in the running makes the next detail obvious; letting someone pick from a
 * truncated list of thirteen would invite picking the wrong person.
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
        Try changing or removing one of the search details. You can also speak
        again to add something different, or start over.
      </Alert>
    );
  }

  const isSelectable = search.mode === "select";
  const matchedFields = search.contacts[0]?.matchedFields ?? [];

  return (
    <Card>
      <CardTitle
        hint={
          isSelectable
            ? "Pick the right person"
            : `Threshold is ${search.threshold}`
        }
      >
        {matchCountLabel(search.total)}
      </CardTitle>

      {!isSelectable ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Too many matches to choose from.</p>
          <p className="mt-1">
            Add another detail such as {suggestionsFor(matchedFields)}. Use{" "}
            <span className="font-medium">Add more details</span> below to speak
            again.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {search.contacts.map((contact) => {
          const isSelected = contact.id === selectedContactId;

          const card = (
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                {contact.label}
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
          );

          if (!isSelectable) {
            return (
              <li
                key={contact.id}
                className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
              >
                {card}
              </li>
            );
          }

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
                {card}
              </label>
            </li>
          );
        })}
      </ul>

      {search.total > search.contacts.length ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Showing the closest {search.contacts.length} of {search.total}.
        </p>
      ) : null}
    </Card>
  );
}
