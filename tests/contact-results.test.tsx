import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactResults } from "@/components/contact-results";
import {
  formatUserLabel,
  type ContactCandidate,
  type ContactSearchOutcome,
} from "@/lib/matching/contact-match";

function candidate(id: number, fname: string, lname: string): ContactCandidate {
  return {
    id,
    fname,
    lname,
    street: "1 Test Street",
    city: "Dallas",
    state: "TX",
    phoneNumber: "+1 (555) 000-0102",
    email: "a@example.com",
    gender: "female",
    label: formatUserLabel(fname, lname),
    score: 1,
    matchedFields: ["fname"],
  };
}

const FOUR = [
  candidate(15, "Amanda", "Willson"),
  candidate(1, "Amanda", "Wilson"),
  candidate(2, "Amanda", "Wilson"),
  candidate(16, "Amandah", "Wilsen"),
];

function refine(
  selectedContactId: number | null,
  interactive = true,
): string {
  const search: ContactSearchOutcome = {
    mode: "refine",
    total: 4,
    threshold: 3,
    contacts: FOUR,
    selectedContactId: null,
  };

  return renderToStaticMarkup(
    <ContactResults
      search={search}
      selectedContactId={selectedContactId}
      busy={false}
      onSelect={() => {}}
      interactive={interactive}
    />,
  );
}

/**
 * Server-rendered markup checks, no jsdom and no user events.
 *
 * These exist for one reported bug: a result chosen by voice while the list was in
 * `refine` mode showed nothing at all, because the rows were rendered read-only in
 * that mode even though the API honours a spoken position there.
 */
describe("ContactResults in refine mode", () => {
  it("indicates the selected row", () => {
    const html = refine(2);

    expect(html).toContain("Selected");
    expect(html).toContain("#3 selected");
    // Selection is offered, not just displayed.
    expect(html).toContain('type="radio"');
    expect(html).toContain('checked=""');
  });

  it("shows no selection marker when nothing is chosen", () => {
    const html = refine(null);

    expect(html).not.toContain("Selected");
    expect(html).toContain("Threshold is 3");
    expect(html).toContain("Too many matches to choose from.");
  });

  it("counts the position from the rendered order", () => {
    // id 15 is displayed first, so it is #1 even though its id is highest.
    expect(refine(15)).toContain("#1 selected");
    expect(refine(16)).toContain("#4 selected");
  });

  it("drops the refinement warning once someone is selected", () => {
    // It was asking the user to narrow the list. They answered it by picking, so
    // leaving it up reads as an unresolved problem.
    expect(refine(2)).not.toContain("Too many matches to choose from.");
    expect(refine(2)).not.toContain("Add another detail such as");
  });

  it("keeps the rows and the count when the warning goes", () => {
    const html = refine(2);

    expect(html).toContain("4 possible matches found");
    expect(html).toContain("Amandah Wilsen");
  });
});

describe("ContactResults as frozen history", () => {
  it("keeps the rows a finished turn showed, with no way to act on them", () => {
    const html = refine(2, false);

    expect(html).toContain("4 possible matches found");
    // Every candidate stays visible, so the log shows what was on offer.
    expect(html).toContain("Amanda Willson");
    expect(html).toContain("Amandah Wilsen");
    // The load-bearing part: an older list must not be selectable, or a click would
    // apply a choice to rows that no longer reflect the current criteria.
    expect(html).not.toContain('type="radio"');
    expect(html).toContain("no longer selectable");
  });

  it("marks the chosen row in place, without repeating a position number", () => {
    const html = refine(2, false);

    expect(html).toContain("Chosen");
    expect(html).toContain("you chose Amanda Wilson");
    // A number here contradicted the user's own message: one counts against the list
    // that was on screen when they spoke, the other against this turn's results.
    expect(html).not.toContain("you chose #");
  });

  it("says a refining turn asked for more detail when nothing was chosen", () => {
    const html = refine(null, false);

    expect(html).toContain("asked for another detail");
    expect(html).not.toContain("Chosen");
  });

  it("drops the retry advice from an empty result once the turn is past", () => {
    const empty: ContactSearchOutcome = {
      mode: "empty",
      total: 0,
      threshold: 3,
      contacts: [],
      selectedContactId: null,
    };

    const frozen = renderToStaticMarkup(
      <ContactResults
        search={empty}
        selectedContactId={null}
        busy={false}
        onSelect={() => {}}
        interactive={false}
      />,
    );

    expect(frozen).toContain("No matching contacts found");
    expect(frozen).not.toContain("Try changing or removing");
  });
});
