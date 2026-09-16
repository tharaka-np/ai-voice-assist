import { describe, expect, it } from "vitest";

import { MATCH_THRESHOLD } from "@/lib/config";
import {
  buildContactFilters,
  countActiveFilters,
  expandStateForms,
  formatUserLabel,
  isFuzzyContactField,
  keepCarriedSelection,
  matchedFieldsFrom,
  normalizeName,
  resolveContactSearch,
  scoreContact,
  type ContactCandidate,
} from "@/lib/matching/contact-match";
import { emptyMeetingRequest, type ConversationState } from "@/schemas/meeting-request";

function state(partial: Partial<ConversationState>): ConversationState {
  return { ...emptyMeetingRequest, ...partial };
}

function candidate(
  id: number,
  fname: string,
  lname: string,
  score: number,
): ContactCandidate {
  return {
    id,
    fname,
    lname,
    street: "1 Test Street",
    city: "Colombo",
    state: "Western",
    phoneNumber: "+94 (11) 555-0141",
    email: `${fname.toLowerCase()}.${lname.toLowerCase()}@example.com`,
    gender: "male",
    label: formatUserLabel(fname, lname),
    score,
    matchedFields: ["fname"],
  };
}

describe("normalizeName", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeName("  Amanda   Wilson  ")).toBe("amanda wilson");
  });

  it("strips punctuation to spaces", () => {
    expect(normalizeName("Dr. Amanda-Wilson!")).toBe("dr amanda wilson");
  });

  it("keeps accented letters rather than dropping them", () => {
    expect(normalizeName("José Álvarez")).toBe("josé álvarez");
  });

  it("reduces a punctuation-only value to an empty string", () => {
    expect(normalizeName(" ... --- ")).toBe("");
  });
});

describe("buildContactFilters", () => {
  it("includes only populated contact fields", () => {
    const filters = buildContactFilters(
      state({ fname: "Tharaka", city: "Colombo" }),
    );

    expect(filters).toEqual({ fname: "tharaka", city: "colombo" });
    expect(countActiveFilters(filters)).toBe(2);
  });

  it("never includes meeting fields", () => {
    const filters = buildContactFilters(
      state({
        meetingDate: "2026-09-20",
        meetingTime: "14:00",
        notes: "Kickoff",
      }),
    );

    expect(filters).toEqual({});
    expect(countActiveFilters(filters)).toBe(0);
  });

  it("lowercases the email", () => {
    expect(
      buildContactFilters(state({ email: "Eric.Poe@Example.COM" })).email,
    ).toBe("eric.poe@example.com");
  });

  it("reduces the phone number to its last ten digits", () => {
    // "+1 (512) 555-0101" stored, "15125550101" spoken: both key on 5125550101.
    expect(
      buildContactFilters(state({ phoneNumber: "+1 (512) 555-0101" })).phoneNumber,
    ).toBe("5125550101");
  });

  it("normalises gender to lowercase", () => {
    expect(buildContactFilters(state({ gender: "female" })).gender).toBe("female");
  });

  it("drops a filter that normalises away to nothing", () => {
    // A city of "..." would otherwise match every row while looking deliberate.
    const filters = buildContactFilters(state({ city: "..." }));

    expect(filters.city).toBeUndefined();
    expect(countActiveFilters(filters)).toBe(0);
  });

  it("classifies which fields are matched fuzzily", () => {
    expect(isFuzzyContactField("fname")).toBe(true);
    expect(isFuzzyContactField("city")).toBe(true);
    expect(isFuzzyContactField("email")).toBe(false);
    expect(isFuzzyContactField("phoneNumber")).toBe(false);
    expect(isFuzzyContactField("gender")).toBe(false);
  });
});

describe("expandStateForms", () => {
  it("expands a full US state name to its abbreviation", () => {
    expect(expandStateForms("Texas")).toEqual(expect.arrayContaining(["texas", "tx"]));
  });

  it("expands an abbreviation to the full name", () => {
    expect(expandStateForms("CA")).toEqual(
      expect.arrayContaining(["ca", "california"]),
    );
  });

  it("handles a two-word state", () => {
    expect(expandStateForms("New York")).toEqual(
      expect.arrayContaining(["new york", "ny"]),
    );
  });

  it("passes a non-US region through unchanged", () => {
    expect(expandStateForms("Western")).toEqual(["western"]);
  });

  it("returns nothing for an empty value", () => {
    expect(expandStateForms("")).toEqual([]);
  });
});

describe("scoreContact", () => {
  it("averages the per-field scores", () => {
    expect(scoreContact({ fname: 1, city: 0.5 })).toBe(0.75);
  });

  it("scores a single exact field as a perfect match", () => {
    expect(scoreContact({ email: 1 })).toBe(1);
  });

  it("does not penalise a row for matching fewer filters", () => {
    // A mean, not a sum: one perfect match must not rank below three loose ones.
    expect(scoreContact({ fname: 1 })).toBeGreaterThan(
      scoreContact({ fname: 0.5, city: 0.5, street: 0.5 }),
    );
  });

  it("clamps out-of-range values", () => {
    expect(scoreContact({ fname: 5 })).toBe(1);
    expect(scoreContact({ fname: -2 })).toBe(0);
  });

  it("returns zero when no field was scored", () => {
    expect(scoreContact({})).toBe(0);
  });

  it("reports which fields contributed", () => {
    expect(matchedFieldsFrom({ fname: 1, city: 0, email: 0.8 })).toEqual([
      "fname",
      "email",
    ]);
  });
});

describe("resolveContactSearch", () => {
  it("reports empty when nothing matched", () => {
    const outcome = resolveContactSearch(0, []);

    expect(outcome.mode).toBe("empty");
    expect(outcome.contacts).toEqual([]);
    expect(outcome.selectedContactId).toBe(null);
  });

  it("stays in refinement mode above the threshold", () => {
    const outcome = resolveContactSearch(13, [candidate(1, "Tharaka", "Perera", 1)]);

    expect(outcome.mode).toBe("refine");
    expect(outcome.total).toBe(13);
    expect(outcome.selectedContactId).toBe(null);
  });

  it("stays in refinement mode at exactly the threshold", () => {
    // The rule is `total >= threshold`, so the boundary still asks for more.
    const outcome = resolveContactSearch(MATCH_THRESHOLD, [
      candidate(1, "Tharaka", "Perera", 1),
    ]);

    expect(outcome.mode).toBe("refine");
  });

  it("offers selection one below the threshold", () => {
    const outcome = resolveContactSearch(MATCH_THRESHOLD - 1, [
      candidate(1, "Tharaka", "Perera", 1),
      candidate(2, "Tharaka", "Silva", 0.9),
    ]);

    expect(outcome.mode).toBe("select");
    expect(outcome.selectedContactId).toBe(null);
  });

  it("preselects a lone remaining contact", () => {
    const outcome = resolveContactSearch(1, [candidate(7, "Eric", "Poe", 1)]);

    expect(outcome.mode).toBe("select");
    expect(outcome.selectedContactId).toBe(7);
  });

  it("never preselects when several remain", () => {
    // Two identical Amanda Wilsons must not be silently disambiguated.
    const outcome = resolveContactSearch(2, [
      candidate(1, "Amanda", "Wilson", 1),
      candidate(2, "Amanda", "Wilson", 1),
    ]);

    expect(outcome.mode).toBe("select");
    expect(outcome.selectedContactId).toBe(null);
  });

  it("sorts by score, then surname, forename and id", () => {
    const outcome = resolveContactSearch(3, [
      candidate(9, "Zoe", "Adams", 0.5),
      candidate(8, "Alan", "Adams", 0.5),
      candidate(7, "Rachel", "Taylor", 0.9),
    ]);

    expect(outcome.contacts.map((contact) => contact.id)).toEqual([7, 8, 9]);
  });

  it("echoes the threshold so the UI does not hardcode it", () => {
    expect(resolveContactSearch(1, []).threshold).toBe(MATCH_THRESHOLD);
    expect(resolveContactSearch(1, [], 9).threshold).toBe(9);
  });

  it("respects an injected threshold", () => {
    expect(resolveContactSearch(6, [candidate(1, "A", "B", 1)], 10).mode).toBe(
      "select",
    );
    expect(resolveContactSearch(6, [candidate(1, "A", "B", 1)], 3).mode).toBe(
      "refine",
    );
  });

  it("does not mutate the input array", () => {
    const input = [candidate(1, "Zoe", "Adams", 0.2), candidate(2, "Eric", "Poe", 1)];
    const order = input.map((contact) => contact.id);

    resolveContactSearch(2, input);

    expect(input.map((contact) => contact.id)).toEqual(order);
  });
});

describe("keepCarriedSelection", () => {
  const amandas = [
    candidate(101, "Amanda", "Wilson", 1),
    candidate(102, "Amanda", "Perera", 1),
    candidate(103, "Amanda", "Silva", 1),
  ];

  it("keeps a selection that is still among the matches", () => {
    // The reported bug: "select the third one" then "schedule it for 4pm". The
    // second turn names no position, and three rows still match, so nothing else
    // would preserve the choice.
    expect(keepCarriedSelection(103, amandas)).toBe(103);
  });

  it("drops a selection the current criteria exclude", () => {
    expect(keepCarriedSelection(103, amandas.slice(0, 2))).toBeNull();
  });

  it("drops an id that was never a match", () => {
    // The value arrives from the client, so it is a claim to verify, not a grant.
    expect(keepCarriedSelection(999, amandas)).toBeNull();
  });

  it("passes through when nothing was selected", () => {
    expect(keepCarriedSelection(null, amandas)).toBeNull();
  });

  it("drops any selection once there are no matches at all", () => {
    expect(keepCarriedSelection(103, [])).toBeNull();
  });
});
