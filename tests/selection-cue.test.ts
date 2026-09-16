import { describe, expect, it } from "vitest";

import {
  mentionsSelection,
  resolveSelectionIntent,
} from "@/lib/matching/selection-cue";

/**
 * This gate is a veto, not a trigger. A true result only permits the model's
 * selection to be honoured; a false result blocks it.
 *
 * So the asymmetry matters: a false negative breaks a real selection, while a false
 * positive merely defers to the model, which is separately instructed that a street
 * number is not an ordinal.
 */

describe("mentionsSelection", () => {
  describe("permits a genuine positional reference", () => {
    it.each([
      "select the third one",
      "Select the second one and schedule a meeting for her on September 10, 2026 at 2 p.m.",
      "number two",
      "the last one",
      "pick the first",
      "choose the fourth",
      "go with the second one",
      "take the 2nd",
      "the 3rd one",
      "option 4",
      "that one",
      "I'll take the one in the middle",
    ])("%s", (transcript) => {
      expect(mentionsSelection(transcript)).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(mentionsSelection("SELECT THE THIRD ONE")).toBe(true);
    });
  });

  describe("blocks a turn with no positional language", () => {
    it.each([
      // The failing case that motivated this gate: a later turn must not re-apply
      // an earlier "select the second one".
      "actually make it 3pm",
      "he lives in Colombo",
      "her last name is Perera",
      "find Tharaka",
      "schedule it for September 20th 2026 at 2pm",
      "her email is eric.poe@example.com",
      "make it an hour later",
      "start over",
    ])("%s", (transcript) => {
      expect(mentionsSelection(transcript)).toBe(false);
    });

    it("is not fooled by a bare time containing a digit", () => {
      // "3pm" is a digit but not an ordinal, so it must not open the gate.
      expect(mentionsSelection("make it 3pm")).toBe(false);
    });

    it("handles an empty transcript", () => {
      expect(mentionsSelection("")).toBe(false);
    });
  });

  describe("known and accepted false positives", () => {
    // These open the gate but do not force a selection — the model still answers
    // "criteria" for them, which the live suite asserts.
    it.each(["she lives on 3rd Street", "he is on First Avenue"])(
      "%s defers to the model rather than blocking",
      (transcript) => {
        expect(mentionsSelection(transcript)).toBe(true);
      },
    );
  });

  it("matches on word boundaries, not substrings", () => {
    // "selection" and "picky" should not read as selection verbs.
    expect(mentionsSelection("the natural selectional pattern")).toBe(false);
    expect(mentionsSelection("she is picky about dates")).toBe(false);
  });
});

describe("resolveSelectionIntent", () => {
  const selection = { intent: "selection" as const, position: 2, keep: "me" };
  const criteria = { intent: "criteria" as const, position: 0, keep: "me" };

  it("honours a selection named in the newest utterance", () => {
    expect(
      resolveSelectionIntent(selection, "select the second one", 4),
    ).toEqual(selection);
  });

  it("downgrades wording carried over from an earlier turn", () => {
    // The live failure this gate exists for: "select the second one" three messages
    // back must not re-apply against a list that has since changed.
    const resolved = resolveSelectionIntent(selection, "actually make it 3pm", 4);

    expect(resolved.intent).toBe("criteria");
    expect(resolved.position).toBe(0);
  });

  it("downgrades when there is no list to pick from", () => {
    // The model answers "selection" even with an empty candidate list.
    const resolved = resolveSelectionIntent(selection, "select the second one", 0);

    expect(resolved.intent).toBe("criteria");
  });

  it("leaves criteria untouched", () => {
    expect(resolveSelectionIntent(criteria, "select the second one", 4)).toBe(
      criteria,
    );
  });

  it("preserves the rest of the turn when downgrading", () => {
    // The merged criteria in the same object are still good — dropping them is the
    // bug this design replaced.
    expect(resolveSelectionIntent(selection, "he lives in Kandy", 4).keep).toBe(
      "me",
    );
  });
});
