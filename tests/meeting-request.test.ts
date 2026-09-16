import { describe, expect, it } from "vitest";

import {
  CONTACT_FIELDS,
  FIELD_LABELS,
  MEETING_FIELDS,
  emptyMeetingRequest,
  meetingRequestExtractionSchema,
  meetingRequestSchema,
  normalizeMeetingRequest,
  populatedContactFields,
  populatedMeetingFields,
  hasContactCriteria,
} from "@/schemas/meeting-request";

/** Mirrors what the pipeline does after `JSON.parse` of the model output. */
function parseModelOutput(raw: unknown) {
  return meetingRequestSchema.safeParse(normalizeMeetingRequest(raw));
}

const COMPLETE = {
  fname: "John",
  lname: "Doe",
  meetingDate: "2026-09-20",
  meetingTime: "14:00",
  notes: "Discuss the next plan of the project",
  city: "San Diego",
  phoneNumber: "5551234567",
  email: "john.doe@example.com",
  street: "47 Pine Street",
  state: "CA",
  gender: "male",
};

describe("meetingRequestSchema", () => {
  it("accepts a fully populated request", () => {
    const result = meetingRequestSchema.safeParse(COMPLETE);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(COMPLETE);
  });

  it("accepts an entirely empty request", () => {
    const result = meetingRequestSchema.safeParse(emptyMeetingRequest);

    expect(result.success).toBe(true);
  });

  it("defaults every absent field to an empty string", () => {
    const result = meetingRequestSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(emptyMeetingRequest);
  });

  it("strips properties outside the schema", () => {
    const result = meetingRequestSchema.safeParse({
      ...COMPLETE,
      nickname: "Johnny",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("nickname");
  });

  describe("gender", () => {
    it.each(["male", "female", ""])("accepts %s", (gender) => {
      expect(meetingRequestSchema.safeParse({ gender }).success).toBe(true);
    });

    it.each(["Male", "FEMALE", "other", "nonbinary", "m", "f", "unknown"])(
      "rejects %s",
      (gender) => {
        expect(meetingRequestSchema.safeParse({ gender }).success).toBe(false);
      },
    );

    it("rejects a null gender", () => {
      expect(meetingRequestSchema.safeParse({ gender: null }).success).toBe(false);
    });
  });

  describe("meetingDate", () => {
    it("accepts an empty value", () => {
      expect(meetingRequestSchema.safeParse({ meetingDate: "" }).success).toBe(
        true,
      );
    });

    it.each(["2026-09-20", "2028-02-29"])("accepts %s", (meetingDate) => {
      expect(
        meetingRequestSchema.safeParse({ meetingDate }).success,
      ).toBe(true);
    });

    it.each(["September 20, 2026", "20/09/2026", "next Friday", "2026-02-31"])(
      "rejects %s",
      (meetingDate) => {
        expect(meetingRequestSchema.safeParse({ meetingDate }).success).toBe(
          false,
        );
      },
    );
  });

  describe("meetingTime", () => {
    it("accepts an empty value", () => {
      expect(meetingRequestSchema.safeParse({ meetingTime: "" }).success).toBe(
        true,
      );
    });

    it.each(["00:00", "09:05", "14:00", "23:59"])("accepts %s", (meetingTime) => {
      expect(meetingRequestSchema.safeParse({ meetingTime }).success).toBe(true);
    });

    it.each(["2:00 PM", "24:00", "14:60", "1400"])("rejects %s", (meetingTime) => {
      expect(meetingRequestSchema.safeParse({ meetingTime }).success).toBe(false);
    });
  });
});

describe("normalizeMeetingRequest", () => {
  it("extracts the specification's worked example", () => {
    const result = parseModelOutput({
      fname: "Amanda",
      lname: "",
      meetingDate: "2026-10-10",
      meetingTime: "15:00",
      notes: "Plan the decoration",
      city: "Austin",
      phoneNumber: "",
      email: "amanda.wilson@example.com",
      street: "",
      state: "",
      gender: "",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      fname: "Amanda",
      lname: "",
      meetingDate: "2026-10-10",
      meetingTime: "15:00",
      notes: "Plan the decoration",
      city: "Austin",
      phoneNumber: "",
      email: "amanda.wilson@example.com",
      street: "",
      state: "",
      gender: "",
    });
  });

  it("fills absent keys with empty strings rather than leaving them undefined", () => {
    expect(normalizeMeetingRequest({})).toEqual(emptyMeetingRequest);
  });

  it("repairs recoverable date and time formatting", () => {
    const result = parseModelOutput({
      meetingDate: "2026-9-2",
      meetingTime: "9:30:00",
    });

    expect(result.success).toBe(true);
    expect(result.data?.meetingDate).toBe("2026-09-02");
    expect(result.data?.meetingTime).toBe("09:30");
  });

  it("lowercases the email", () => {
    expect(normalizeMeetingRequest({ email: " John.Doe@Example.COM " })).toMatchObject(
      { email: "john.doe@example.com" },
    );
  });

  it("reduces a phone number to digits", () => {
    expect(
      normalizeMeetingRequest({ phoneNumber: "+1 (555) 123-4567" }),
    ).toMatchObject({ phoneNumber: "15551234567" });
  });

  it.each(["unknown", "N/A", "not specified", "none", "null", "-"])(
    "treats the placeholder %s as not stated",
    (value) => {
      expect(normalizeMeetingRequest({ city: value })).toMatchObject({ city: "" });
    },
  );

  it("lowercases a stated gender and discards anything else", () => {
    expect(normalizeMeetingRequest({ gender: "Female" })).toMatchObject({
      gender: "female",
    });
    expect(normalizeMeetingRequest({ gender: "nonbinary" })).toMatchObject({
      gender: "",
    });
  });

  it("collapses whitespace inside names", () => {
    expect(normalizeMeetingRequest({ fname: "  Eric  " })).toMatchObject({
      fname: "Eric",
    });
  });

  it("drops properties outside the schema", () => {
    const normalized = normalizeMeetingRequest({ fname: "Eric", nickname: "Rick" });

    expect(normalized).not.toHaveProperty("nickname");
  });

  it("passes non-object input through for Zod to reject", () => {
    expect(normalizeMeetingRequest("not an object")).toBe("not an object");
    expect(parseModelOutput(null).success).toBe(false);
    expect(parseModelOutput([1, 2]).success).toBe(false);
  });
});

describe("field groups", () => {
  it("separates contact fields from meeting fields with no overlap", () => {
    const overlap = CONTACT_FIELDS.filter((field) =>
      (MEETING_FIELDS as readonly string[]).includes(field),
    );

    expect(overlap).toEqual([]);
  });

  it("covers every schema key exactly once", () => {
    const grouped = [...CONTACT_FIELDS, ...MEETING_FIELDS].sort();
    const schemaKeys = Object.keys(meetingRequestSchema.shape).sort();

    expect(grouped).toEqual(schemaKeys);
  });

  it("has a label for every field", () => {
    for (const field of [...CONTACT_FIELDS, ...MEETING_FIELDS]) {
      expect(FIELD_LABELS[field]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("lists only populated fields", () => {
    const state = {
      ...emptyMeetingRequest,
      fname: "Tharaka",
      city: "Colombo",
      meetingTime: "14:00",
    };

    expect(populatedContactFields(state)).toEqual(["fname", "city"]);
    expect(populatedMeetingFields(state)).toEqual(["meetingTime"]);
  });

  it("reports whether any contact criterion exists", () => {
    expect(hasContactCriteria(emptyMeetingRequest)).toBe(false);
    // Meeting-only details are not a reason to run a directory search.
    expect(
      hasContactCriteria({ ...emptyMeetingRequest, meetingDate: "2026-09-20" }),
    ).toBe(false);
    expect(hasContactCriteria({ ...emptyMeetingRequest, city: "Colombo" })).toBe(
      true,
    );
  });

  // There is deliberately no `clearField` test any more. Removing a single field
  // was the criteria-chip affordance, and that layer is gone: state is re-derived
  // from the conversation on every turn, so a locally cleared field would simply
  // reappear. Corrections are spoken instead.
});

describe("meetingRequestExtractionSchema descriptor", () => {
  const { jsonSchema } = meetingRequestExtractionSchema;

  it("is a strict object, as OpenAI Structured Outputs requires", () => {
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.additionalProperties).toBe(false);
  });

  it("keeps the JSON Schema and the Zod schema in step", () => {
    const zodKeys = Object.keys(meetingRequestSchema.shape).sort();
    const jsonKeys = Object.keys(jsonSchema.properties).sort();

    expect(jsonKeys).toEqual(zodKeys);
    expect([...jsonSchema.required].sort()).toEqual(zodKeys);
  });

  it("declares gender as an enum that permits the empty string", () => {
    const gender = jsonSchema.properties.gender as {
      enum?: readonly string[];
    };

    expect(gender.enum).toEqual(["", "male", "female"]);
  });

  it("declares every other property as a plain string", () => {
    for (const [key, property] of Object.entries(jsonSchema.properties)) {
      if (key === "gender") continue;
      expect((property as { type?: unknown }).type, key).toBe("string");
    }
  });

  it("instructs the model to merge the whole conversation, latest mention winning", () => {
    const guidance = meetingRequestExtractionSchema.fieldGuidance;

    expect(guidance).toContain("ENTIRE conversation");
    expect(guidance).toContain("Silence is not a deletion");
    expect(guidance).toContain("LATEST message");
  });

  it("still forbids inferring gender from a name", () => {
    expect(meetingRequestExtractionSchema.fieldGuidance).toContain(
      "infer it from a first name",
    );
  });

  it("carries both worked examples the merging behaviour depends on", () => {
    const guidance = meetingRequestExtractionSchema.fieldGuidance;

    // Turn-two-omits-the-name, and person-replacement.
    expect(guidance).toContain("He lives in Colombo");
    expect(guidance).toContain("Actually, find Eric Poe instead");
  });

  it("carries a schema name OpenAI accepts and a bumped version", () => {
    expect(meetingRequestExtractionSchema.name).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(meetingRequestExtractionSchema.version).toMatch(/^2\.\d+\.\d+$/);
  });
});
