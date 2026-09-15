import { describe, expect, it } from "vitest";

import {
  AUTO_SELECT_SCORE,
  MAX_CANDIDATES,
  formatUserLabel,
  normalizeName,
  resolveCandidates,
  scoreCandidate,
  type UserCandidate,
} from "@/lib/matching/name-match";

/** Builds a candidate with a given score, for ranking tests. */
function candidate(
  id: number,
  fname: string,
  lname: string,
  score: number,
): UserCandidate {
  return { id, fname, lname, label: formatUserLabel(fname, lname), score };
}

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Amanda Wilson  ")).toBe("amanda wilson");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeName("Amanda    Wilson")).toBe("amanda wilson");
  });

  it("strips punctuation to spaces", () => {
    expect(normalizeName("Dr. Amanda-Wilson!")).toBe("dr amanda wilson");
    expect(normalizeName("O'Brien, Sean")).toBe("o brien sean");
  });

  it("keeps accented letters rather than dropping them", () => {
    // A plain [^a-z] class would silently delete these.
    expect(normalizeName("José Álvarez")).toBe("josé álvarez");
  });

  it("keeps digits, which appear in some directory names", () => {
    expect(normalizeName("Unit 42")).toBe("unit 42");
  });

  it("reduces a punctuation-only value to an empty string", () => {
    expect(normalizeName("  ... --- ")).toBe("");
    expect(normalizeName("")).toBe("");
  });
});

describe("scoreCandidate", () => {
  it("scores an exact full name highest", () => {
    expect(
      scoreCandidate({
        exactFullName: true,
        exactReversedName: false,
        exactNamePart: false,
        trigramSimilarity: 0.4,
      }),
    ).toBe(1);
  });

  it("scores a reversed name below an exact one", () => {
    expect(
      scoreCandidate({
        exactFullName: false,
        exactReversedName: true,
        exactNamePart: false,
        trigramSimilarity: 0,
      }),
    ).toBe(0.9);
  });

  it("scores a single name part below a reversed full name", () => {
    expect(
      scoreCandidate({
        exactFullName: false,
        exactReversedName: false,
        exactNamePart: true,
        trigramSimilarity: 0,
      }),
    ).toBe(0.8);
  });

  it("caps a fuzzy match below every exact tier", () => {
    // The guarantee from the design doc: an exact match always wins.
    const nearPerfectFuzzy = scoreCandidate({
      exactFullName: false,
      exactReversedName: false,
      exactNamePart: false,
      trigramSimilarity: 0.99,
    });

    expect(nearPerfectFuzzy).toBe(0.79);
    expect(nearPerfectFuzzy).toBeLessThan(0.8);
  });

  it("passes a mid-range trigram score through", () => {
    expect(
      scoreCandidate({
        exactFullName: false,
        exactReversedName: false,
        exactNamePart: false,
        trigramSimilarity: 0.5,
      }),
    ).toBe(0.5);
  });

  it("clamps a negative or missing similarity to zero", () => {
    expect(
      scoreCandidate({
        exactFullName: false,
        exactReversedName: false,
        exactNamePart: false,
        trigramSimilarity: -1,
      }),
    ).toBe(0);
  });
});

describe("resolveCandidates", () => {
  it("reports unresolved when nothing matched", () => {
    expect(resolveCandidates([])).toEqual({
      status: "unresolved",
      selectedUserId: null,
      candidates: [],
    });
  });

  it("preselects a single confident match", () => {
    const resolution = resolveCandidates([candidate(5, "Eric", "Poe", 1)]);

    expect(resolution.status).toBe("resolved");
    expect(resolution.selectedUserId).toBe(5);
  });

  it("refuses to choose between two identical names", () => {
    // The seeded duplicate: two Amanda Wilsons, both exact.
    const resolution = resolveCandidates([
      candidate(1, "Amanda", "Wilson", 1),
      candidate(2, "Amanda", "Wilson", 1),
    ]);

    expect(resolution.status).toBe("ambiguous");
    expect(resolution.selectedUserId).toBe(null);
    expect(resolution.candidates).toHaveLength(2);
  });

  it("preselects the exact match but still returns the near miss", () => {
    // The misheard-name case: Taraka exact, Tharaka close behind.
    const resolution = resolveCandidates([
      candidate(3, "Tharaka", "Pathirana", 0.75),
      candidate(4, "Taraka", "Pathirana", 1),
    ]);

    expect(resolution.status).toBe("resolved");
    expect(resolution.selectedUserId).toBe(4);
    expect(resolution.candidates.map((item) => item.id)).toEqual([4, 3]);
  });

  it("stays ambiguous when the best match is only fuzzy", () => {
    const resolution = resolveCandidates([candidate(7, "Rachel", "Taylor", 0.6)]);

    expect(resolution.status).toBe("ambiguous");
    expect(resolution.selectedUserId).toBe(null);
  });

  it("treats a score just below the threshold as not confident", () => {
    const resolution = resolveCandidates([
      candidate(7, "Rachel", "Taylor", AUTO_SELECT_SCORE - 0.01),
    ]);

    expect(resolution.status).toBe("ambiguous");
  });

  it("sorts by score, then surname, then forename, then id", () => {
    const resolution = resolveCandidates([
      candidate(9, "Zoe", "Adams", 0.5),
      candidate(8, "Alan", "Adams", 0.5),
      candidate(7, "Rachel", "Taylor", 0.6),
    ]);

    expect(resolution.candidates.map((item) => item.id)).toEqual([7, 8, 9]);
  });

  it("truncates a long candidate list", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      candidate(index + 1, "Test", `Person${index}`, 0.5),
    );

    expect(resolveCandidates(many).candidates).toHaveLength(MAX_CANDIDATES);
  });

  it("does not mutate the input array", () => {
    const input = [
      candidate(1, "Amanda", "Wilson", 0.5),
      candidate(2, "Eric", "Poe", 1),
    ];
    const order = input.map((item) => item.id);

    resolveCandidates(input);

    expect(input.map((item) => item.id)).toEqual(order);
  });
});

describe("formatUserLabel", () => {
  it("joins the parts with a single space", () => {
    expect(formatUserLabel("Amanda", "Wilson")).toBe("Amanda Wilson");
  });

  it("tolerates stray whitespace in the stored values", () => {
    expect(formatUserLabel("  Amanda ", " Wilson  ")).toBe("Amanda Wilson");
  });
});
