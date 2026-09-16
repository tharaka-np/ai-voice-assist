import { describe, expect, it } from "vitest";

import {
  NO_POSITION,
  TURN_INTENTS,
  conversationTurnExtractionSchema,
  conversationTurnSchema,
  normalizeConversationTurn,
} from "@/schemas/conversation-turn";
import {
  emptyMeetingRequest,
  meetingRequestSchema,
} from "@/schemas/meeting-request";

/** Mirrors what the pipeline does after `JSON.parse` of the model output. */
function parseTurn(raw: unknown) {
  return conversationTurnSchema.safeParse(normalizeConversationTurn(raw));
}

const CRITERIA_TURN = {
  intent: "criteria",
  position: 0,
  request: { ...emptyMeetingRequest, fname: "Tharaka", city: "Colombo" },
};

const SELECTION_TURN = {
  intent: "selection",
  position: 3,
  request: emptyMeetingRequest,
};

describe("conversationTurnSchema", () => {
  it("accepts a criteria turn", () => {
    const result = parseTurn(CRITERIA_TURN);

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe("criteria");
    expect(result.data?.request.fname).toBe("Tharaka");
  });

  it("accepts a selection turn", () => {
    const result = parseTurn(SELECTION_TURN);

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe("selection");
    expect(result.data?.position).toBe(3);
  });

  it("defaults an empty object to a criteria turn with no position", () => {
    const result = conversationTurnSchema.safeParse({ request: {} });

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe("criteria");
    expect(result.data?.position).toBe(NO_POSITION);
  });

  it("rejects an unknown intent", () => {
    expect(
      conversationTurnSchema.safeParse({ ...CRITERIA_TURN, intent: "delete" })
        .success,
    ).toBe(false);
  });

  it("rejects a negative position", () => {
    expect(
      conversationTurnSchema.safeParse({ ...SELECTION_TURN, position: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects an absurd position", () => {
    expect(
      conversationTurnSchema.safeParse({ ...SELECTION_TURN, position: 9999 })
        .success,
    ).toBe(false);
  });

  it("still validates the nested request", () => {
    const result = conversationTurnSchema.safeParse({
      ...CRITERIA_TURN,
      request: { ...emptyMeetingRequest, meetingDate: "next Friday" },
    });

    expect(result.success).toBe(false);
  });

  it("only permits the two documented intents", () => {
    expect([...TURN_INTENTS]).toEqual(["criteria", "selection"]);
  });
});

describe("normalizeConversationTurn fails safe", () => {
  // Every ambiguous input must land on "criteria". Treating a criteria turn as a
  // selection silently picks a person; the reverse just asks the user to repeat.

  it.each([
    ["a misspelled intent", "Selection"],
    ["an unrelated word", "choose"],
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
  ])("treats %s as criteria", (_label, intent) => {
    expect(normalizeConversationTurn({ intent, position: 3, request: {} })).toMatchObject(
      { intent: "criteria" },
    );
  });

  it("keeps a literal selection intent", () => {
    expect(
      normalizeConversationTurn({ intent: "selection", position: 2, request: {} }),
    ).toMatchObject({ intent: "selection", position: 2 });
  });

  it.each([
    ["a float", 2.7, 2],
    ["a negative", -5, NO_POSITION],
    ["a string", "3", NO_POSITION],
    ["null", null, NO_POSITION],
    ["NaN", Number.NaN, NO_POSITION],
    ["Infinity", Number.POSITIVE_INFINITY, NO_POSITION],
  ])("coerces %s to %i", (_label, position, expected) => {
    expect(
      normalizeConversationTurn({ intent: "selection", position, request: {} }),
    ).toMatchObject({ position: expected });
  });

  it("normalises the nested request too", () => {
    const normalized = normalizeConversationTurn({
      intent: "criteria",
      position: 0,
      request: { fname: "  Eric  ", email: "ERIC@Example.COM", city: "unknown" },
    });

    expect(normalized).toMatchObject({
      request: expect.objectContaining({
        fname: "Eric",
        email: "eric@example.com",
        // Placeholder words must not become search filters.
        city: "",
      }),
    });
  });

  it("passes non-object input through for Zod to reject", () => {
    expect(normalizeConversationTurn("nope")).toBe("nope");
    expect(parseTurn(null).success).toBe(false);
    expect(parseTurn([1, 2]).success).toBe(false);
  });
});

describe("conversationTurnExtractionSchema descriptor", () => {
  const { jsonSchema } = conversationTurnExtractionSchema;

  it("is a strict object", () => {
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(false);
    expect([...jsonSchema.required].sort()).toEqual([
      "intent",
      "position",
      "request",
    ]);
  });

  it("constrains intent to the two values", () => {
    const intent = jsonSchema.properties.intent as { enum?: readonly string[] };

    expect(intent.enum).toEqual(["criteria", "selection"]);
  });

  it("declares position as an integer", () => {
    const position = jsonSchema.properties.position as { type?: unknown };

    expect(position.type).toBe("integer");
  });

  it("nests the request as a strict object with every field required", () => {
    const request = jsonSchema.properties.request as {
      type?: unknown;
      additionalProperties?: unknown;
      required?: readonly string[];
    };

    expect(request.type).toBe("object");
    // Strict mode applies at every level, not just the root.
    expect(request.additionalProperties).toBe(false);
    expect([...(request.required ?? [])].sort()).toEqual(
      Object.keys(meetingRequestSchema.shape).sort(),
    );
  });

  it("reuses the conversation-merging guidance verbatim", () => {
    const guidance = conversationTurnExtractionSchema.fieldGuidance;

    expect(guidance).toContain("ENTIRE conversation");
    expect(guidance).toContain("Silence is not a deletion");
  });

  it("carries a bumped version, since the output shape changed", () => {
    expect(conversationTurnExtractionSchema.version).toMatch(/^3\.\d+\.\d+$/);
    expect(conversationTurnExtractionSchema.name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
