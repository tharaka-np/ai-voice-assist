import { describe, expect, it } from "vitest";

import {
  MeetingInfoSchema,
  meetingExtractionSchema,
  normalizeMeetingInfo,
} from "@/schemas/meeting";

/**
 * Covers the layer that stands between the model and the API response: the
 * deterministic normaliser plus Zod validation. Together these are what stop an
 * invalid model response from reaching the client.
 */

/** Mirrors what the pipeline does after `JSON.parse` of the model output. */
function parseModelOutput(raw: unknown) {
  return MeetingInfoSchema.safeParse(normalizeMeetingInfo(raw));
}

describe("normalizeMeetingInfo", () => {
  it("zero-pads a single-digit month and day", () => {
    expect(normalizeMeetingInfo({ meetingDate: "2026-9-2" })).toMatchObject({
      meetingDate: "2026-09-02",
    });
  });

  it("zero-pads a single-digit hour and drops seconds", () => {
    expect(normalizeMeetingInfo({ meetingTime: "9:30" })).toMatchObject({
      meetingTime: "09:30",
    });
    expect(normalizeMeetingInfo({ meetingTime: "14:00:00" })).toMatchObject({
      meetingTime: "14:00",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeMeetingInfo({ name: "  Tharaka  " })).toMatchObject({
      name: "Tharaka",
    });
  });

  it("converts empty and whitespace-only strings to null", () => {
    expect(normalizeMeetingInfo({ name: "", notes: "   " })).toMatchObject({
      name: null,
      notes: null,
    });
  });

  it.each(["null", "None", "N/A", "unknown", "Not specified", "not mentioned"])(
    "converts the placeholder %s to null",
    (value) => {
      expect(normalizeMeetingInfo({ name: value })).toMatchObject({ name: null });
    },
  );

  it("fills absent keys with null rather than leaving them undefined", () => {
    expect(normalizeMeetingInfo({})).toEqual({
      name: null,
      meetingDate: null,
      meetingTime: null,
      notes: null,
    });
  });

  it("drops properties outside the schema", () => {
    const normalized = normalizeMeetingInfo({
      name: "Tharaka",
      attendees: ["someone"],
      location: "Colombo",
    });

    expect(normalized).not.toHaveProperty("attendees");
    expect(normalized).not.toHaveProperty("location");
  });

  it("passes non-object input straight through for Zod to reject", () => {
    expect(normalizeMeetingInfo("not an object")).toBe("not an object");
    expect(normalizeMeetingInfo(null)).toBe(null);
    expect(normalizeMeetingInfo([1, 2])).toEqual([1, 2]);
  });

  it("leaves an unrecognised date format alone so validation can fail loudly", () => {
    expect(normalizeMeetingInfo({ meetingDate: "September 20, 2026" })).toMatchObject(
      { meetingDate: "September 20, 2026" },
    );
  });
});

describe("model output parsing", () => {
  it("accepts the worked example from the brief", () => {
    const result = parseModelOutput({
      name: "Tharaka",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
      notes: "Discuss the upcoming ScriptTrainer release",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Tharaka",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
      notes: "Discuss the upcoming ScriptTrainer release",
    });
  });

  it("accepts a response where only a name was stated", () => {
    const result = parseModelOutput({
      name: "Tharaka",
      meetingDate: null,
      meetingTime: null,
      notes: null,
    });

    expect(result.success).toBe(true);
    expect(result.data?.meetingDate).toBe(null);
  });

  it("repairs recoverable formatting before validating", () => {
    const result = parseModelOutput({
      name: " Tharaka ",
      meetingDate: "2026-9-20",
      meetingTime: "9:00:00",
      notes: "  Kickoff  ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Tharaka",
      meetingDate: "2026-09-20",
      meetingTime: "09:00",
      notes: "Kickoff",
    });
  });

  it.each([
    ["a bare string", "just text"],
    ["null", null],
    ["an array", []],
    ["a prose date", { name: null, meetingDate: "next Friday", meetingTime: null, notes: null }],
    ["a 12-hour time", { name: null, meetingDate: null, meetingTime: "2:00 PM", notes: null }],
    ["an impossible date", { name: null, meetingDate: "2026-02-31", meetingTime: null, notes: null }],
    ["a numeric name", { name: 7, meetingDate: null, meetingTime: null, notes: null }],
    ["a nested object", { name: { first: "Tharaka" }, meetingDate: null, meetingTime: null, notes: null }],
  ])("rejects %s", (_label, raw) => {
    expect(parseModelOutput(raw).success).toBe(false);
  });
});

describe("meetingExtractionSchema descriptor", () => {
  const { jsonSchema } = meetingExtractionSchema;

  it("is a strict object, as OpenAI Structured Outputs requires", () => {
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(false);
  });

  it("keeps the JSON Schema and the Zod schema in step", () => {
    const zodKeys = Object.keys(MeetingInfoSchema.shape).sort();
    const jsonKeys = Object.keys(jsonSchema.properties).sort();

    expect(jsonKeys).toEqual(zodKeys);
    // Strict mode requires every property to be listed as required.
    expect([...jsonSchema.required].sort()).toEqual(zodKeys);
  });

  it("declares every property nullable so absent values are expressible", () => {
    for (const [key, property] of Object.entries(jsonSchema.properties)) {
      const declared = (property as { type?: unknown }).type;

      expect(Array.isArray(declared), `${key} should declare a type union`).toBe(
        true,
      );
      expect(declared as unknown[]).toContain("null");
      expect(declared as unknown[]).toContain("string");
    }
  });

  it("carries a schema name OpenAI will accept and a version for auditing", () => {
    expect(meetingExtractionSchema.name).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(meetingExtractionSchema.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
