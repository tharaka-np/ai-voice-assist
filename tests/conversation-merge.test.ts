import { describe, expect, it } from "vitest";

import {
  clearField,
  emptyMeetingRequest,
  mergeConversationState,
  type ConversationState,
} from "@/schemas/meeting-request";

/** Builds a full state from a partial, so scenarios stay readable. */
function state(partial: Partial<ConversationState>): ConversationState {
  return { ...emptyMeetingRequest, ...partial };
}

/** Applies successive turns the way the route does, one merge per turn. */
function converse(
  ...turns: Partial<ConversationState>[]
): ConversationState {
  return turns.reduce<ConversationState>(
    (accumulated, turn) => mergeConversationState(accumulated, state(turn)),
    emptyMeetingRequest,
  );
}

describe("mergeConversationState", () => {
  it("rule 1: an empty incoming value never erases what we already knew", () => {
    const previous = state({
      fname: "Amanda",
      city: "Austin",
      email: "amanda.wilson@example.com",
    });

    const merged = mergeConversationState(previous, emptyMeetingRequest);

    expect(merged).toEqual(previous);
  });

  it("rule 2: a non-empty incoming value replaces the previous one", () => {
    const merged = mergeConversationState(
      state({ fname: "Amanda", city: "Austin" }),
      state({ fname: "Eric" }),
    );

    expect(merged.fname).toBe("Eric");
    expect(merged.city).toBe("Austin");
  });

  it("reproduces the specification's merge example exactly", () => {
    const previous = state({
      fname: "Amanda",
      lname: "",
      city: "Austin",
      email: "amanda.wilson@example.com",
      meetingDate: "2026-10-10",
      meetingTime: "15:00",
      notes: "Plan the decoration",
    });

    const incoming = state({
      fname: "Eric",
      lname: "Poe",
      city: "",
      email: "eric.poe@example.com",
    });

    expect(mergeConversationState(previous, incoming)).toEqual(
      state({
        fname: "Eric",
        lname: "Poe",
        city: "Austin",
        email: "eric.poe@example.com",
        meetingDate: "2026-10-10",
        meetingTime: "15:00",
        notes: "Plan the decoration",
      }),
    );
  });

  it("does not mutate either input", () => {
    const previous = state({ fname: "Amanda" });
    const incoming = state({ fname: "Eric" });

    mergeConversationState(previous, incoming);

    expect(previous.fname).toBe("Amanda");
    expect(incoming.fname).toBe("Eric");
  });

  it("merges every field, so no key is silently dropped", () => {
    const full = state({
      fname: "John",
      lname: "Doe",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
      notes: "Kickoff",
      city: "San Diego",
      phoneNumber: "5551234567",
      email: "john.doe@example.com",
      street: "47 Pine Street",
      state: "CA",
      gender: "male",
    });

    expect(mergeConversationState(emptyMeetingRequest, full)).toEqual(full);
    expect(mergeConversationState(full, emptyMeetingRequest)).toEqual(full);
  });
});

describe("conversation scenarios", () => {
  it("scenario A: one-shot complete request", () => {
    const result = converse({
      fname: "John",
      lname: "Doe",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
      notes: "Discuss the next plan of the project",
      city: "San Diego",
      phoneNumber: "5551234567",
      email: "john.doe@example.com",
    });

    expect(result.fname).toBe("John");
    expect(result.city).toBe("San Diego");
    expect(result.phoneNumber).toBe("5551234567");
  });

  it("scenario B: three-turn narrowing keeps the meeting details throughout", () => {
    const turn1 = converse({
      fname: "Tharaka",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
      notes: "Discuss the upcoming Spice CRM release",
    });
    expect(turn1.city).toBe("");

    const turn2 = mergeConversationState(turn1, state({ city: "Colombo" }));
    expect(turn2).toMatchObject({
      fname: "Tharaka",
      city: "Colombo",
      meetingDate: "2026-09-20",
      notes: "Discuss the upcoming Spice CRM release",
    });

    const turn3 = mergeConversationState(turn2, state({ lname: "Perera" }));
    expect(turn3).toMatchObject({
      fname: "Tharaka",
      lname: "Perera",
      city: "Colombo",
      meetingTime: "14:00",
      notes: "Discuss the upcoming Spice CRM release",
    });
  });

  it("scenario C: changing the target contact retains the meeting", () => {
    const result = converse(
      {
        fname: "Amanda",
        city: "Austin",
        email: "amanda.wilson@example.com",
        meetingDate: "2026-10-10",
        meetingTime: "15:00",
        notes: "Plan the decoration",
      },
      { fname: "Eric", lname: "Poe", email: "eric.poe@example.com" },
    );

    expect(result).toEqual(
      state({
        fname: "Eric",
        lname: "Poe",
        city: "Austin",
        email: "eric.poe@example.com",
        meetingDate: "2026-10-10",
        meetingTime: "15:00",
        notes: "Plan the decoration",
      }),
    );
  });

  it("adds a city on a later turn", () => {
    const result = converse({ fname: "Tharaka" }, { city: "Colombo" });

    expect(result).toMatchObject({ fname: "Tharaka", city: "Colombo" });
  });

  it("adds a phone number on a later turn", () => {
    const result = converse({ fname: "John" }, { phoneNumber: "5551234567" });

    expect(result.phoneNumber).toBe("5551234567");
  });

  it("changes just the last name", () => {
    const result = converse(
      { fname: "Tharaka", lname: "Pathirana" },
      { lname: "Perera" },
    );

    expect(result).toMatchObject({ fname: "Tharaka", lname: "Perera" });
  });

  it("changes just the email", () => {
    const result = converse(
      { fname: "Eric", email: "old@example.com" },
      { email: "eric.poe@example.com" },
    );

    expect(result).toMatchObject({
      fname: "Eric",
      email: "eric.poe@example.com",
    });
  });

  it("adds gender on a later turn", () => {
    const result = converse({ fname: "Alex" }, { gender: "female" });

    expect(result.gender).toBe("female");
  });

  it("survives a turn that stated nothing at all", () => {
    // What an unusable recording produces: a transcript with no extractable
    // fields. The accumulated criteria must be untouched.
    const before = converse({ fname: "Tharaka", city: "Colombo" });
    const after = mergeConversationState(before, emptyMeetingRequest);

    expect(after).toEqual(before);
  });

  it("resets to an empty state on start over", () => {
    const populated = converse({ fname: "Tharaka", city: "Colombo" });

    expect(populated).not.toEqual(emptyMeetingRequest);
    // Start Over replaces the state wholesale rather than merging.
    expect(emptyMeetingRequest).toEqual({
      fname: "",
      lname: "",
      meetingDate: "",
      meetingTime: "",
      notes: "",
      city: "",
      phoneNumber: "",
      email: "",
      street: "",
      state: "",
      gender: "",
    });
  });

  it("lets a removed chip be re-added by a later turn", () => {
    const withCity = converse({ fname: "Tharaka", city: "Colombo" });
    const removed = clearField(withCity, "city");
    expect(removed.city).toBe("");

    const readded = mergeConversationState(removed, state({ city: "Kandy" }));
    expect(readded.city).toBe("Kandy");
    expect(readded.fname).toBe("Tharaka");
  });
});
