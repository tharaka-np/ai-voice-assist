import { describe, expect, it } from "vitest";

import { MeetingInfoSchema, isRealCalendarDate } from "@/schemas/meeting";

describe("MeetingInfoSchema", () => {
  it("accepts a fully populated record", () => {
    const result = MeetingInfoSchema.safeParse({
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

  it("accepts every field as null, since nothing may be invented", () => {
    const result = MeetingInfoSchema.safeParse({
      name: null,
      meetingDate: null,
      meetingTime: null,
      notes: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a record with a missing key", () => {
    const result = MeetingInfoSchema.safeParse({
      name: "Tharaka",
      meetingDate: "2026-09-20",
      meetingTime: "14:00",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "notes")).toBe(
      true,
    );
  });

  it("rejects non-string values", () => {
    const result = MeetingInfoSchema.safeParse({
      name: 42,
      meetingDate: null,
      meetingTime: null,
      notes: null,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty string, which is neither a value nor an honest null", () => {
    const result = MeetingInfoSchema.safeParse({
      name: "",
      meetingDate: null,
      meetingTime: null,
      notes: null,
    });

    expect(result.success).toBe(false);
  });

  it("strips properties outside the schema", () => {
    const result = MeetingInfoSchema.safeParse({
      name: null,
      meetingDate: null,
      meetingTime: null,
      notes: null,
      location: "Colombo",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("location");
  });

  describe("meetingDate", () => {
    it.each(["September 20, 2026", "20/09/2026", "2026/09/20", "2026-9-2"])(
      "rejects the non-ISO date %s",
      (meetingDate) => {
        const result = MeetingInfoSchema.safeParse({
          name: null,
          meetingDate,
          meetingTime: null,
          notes: null,
        });

        expect(result.success).toBe(false);
      },
    );

    it("rejects a well-formed but impossible date", () => {
      const result = MeetingInfoSchema.safeParse({
        name: null,
        meetingDate: "2026-02-31",
        meetingTime: null,
        notes: null,
      });

      expect(result.success).toBe(false);
    });

    it("accepts a leap day in a leap year", () => {
      const result = MeetingInfoSchema.safeParse({
        name: null,
        meetingDate: "2028-02-29",
        meetingTime: null,
        notes: null,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("meetingTime", () => {
    it.each(["00:00", "09:05", "14:00", "23:59"])(
      "accepts the 24-hour time %s",
      (meetingTime) => {
        const result = MeetingInfoSchema.safeParse({
          name: null,
          meetingDate: null,
          meetingTime,
          notes: null,
        });

        expect(result.success).toBe(true);
      },
    );

    it.each(["2:00 PM", "24:00", "25:30", "14:60", "1400", "14:0"])(
      "rejects the invalid time %s",
      (meetingTime) => {
        const result = MeetingInfoSchema.safeParse({
          name: null,
          meetingDate: null,
          meetingTime,
          notes: null,
        });

        expect(result.success).toBe(false);
      },
    );
  });
});

describe("isRealCalendarDate", () => {
  it.each([
    ["2026-09-20", true],
    ["2028-02-29", true],
    ["2027-02-29", false],
    ["2026-02-31", false],
    ["2026-13-01", false],
    ["2026-00-10", false],
    ["not-a-date", false],
  ] as const)("treats %s as %s", (value, expected) => {
    expect(isRealCalendarDate(value)).toBe(expected);
  });
});
