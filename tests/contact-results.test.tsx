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
describe("ContactResults with nothing chosen yet", () => {
  it("asks the question, with a radio per candidate", () => {
    const html = refine(null);

    expect(html).toContain("4 possible matches found");
    expect(html).toContain("Threshold is 3");
    expect(html).toContain("Too many matches to choose from.");
    expect(html.match(/type="radio"/g)?.length).toBe(4);
    expect(html).not.toContain("Selected");
  });
});

describe("ContactResults once a choice is settled", () => {
  it("states the choice instead of asking again", () => {
    const html = refine(2);

    expect(html).toContain("Selected");
    expect(html).toContain("Amanda Wilson");
    // The question has been answered, so it is no longer put.
    expect(html).not.toContain("4 possible matches found");
    expect(html).not.toContain("Too many matches to choose from.");
  });

  it("never prints a position number", () => {
    // It would count against this turn's results, while the user's own message counts
    // against the list that was on screen when they spoke. Those disagree the moment a
    // turn re-ranks the list — which is how "#1 selected" ended up under "chose #2".
    for (const id of [15, 1, 2, 16]) {
      const html = refine(id);
      expect(html).not.toContain("selected</span>");
      expect(html).not.toMatch(/#\d/);
    }
  });

  it("shows no candidate list at all", () => {
    const html = refine(2);

    // The whole point: nothing between the confirmation and the meeting form.
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Change ·");
    expect(html).not.toContain("Amandah Wilsen");
    // Changing is still possible, so the route to it is named.
    expect(html).toContain("Say another position to switch");
  });

  it("says nothing about switching when there is nothing to switch to", () => {
    const html = renderToStaticMarkup(
      <ContactResults
        search={{
          mode: "select",
          total: 1,
          threshold: 3,
          contacts: [FOUR[1]],
          selectedContactId: FOUR[1].id,
        }}
        selectedContactId={FOUR[1].id}
        busy={false}
        onSelect={() => {}}
        interactive
      />,
    );

    expect(html).toContain("Selected");
    expect(html).not.toContain("<details");
    expect(html).not.toContain('type="radio"');
  });

  it("says Found rather than Selected for an auto-selected lone match", () => {
    const html = renderToStaticMarkup(
      <ContactResults
        search={{
          mode: "select",
          total: 1,
          threshold: 3,
          contacts: [FOUR[1]],
          selectedContactId: null,
        }}
        selectedContactId={null}
        busy={false}
        onSelect={() => {}}
        interactive
      />,
    );

    expect(html).toContain("Found");
    expect(html).not.toContain('type="radio"');
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
