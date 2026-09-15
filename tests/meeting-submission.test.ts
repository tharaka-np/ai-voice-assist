import { describe, expect, it } from "vitest";

import {
  MeetingSubmissionSchema,
  SavedMeetingRowSchema,
} from "@/schemas/meeting-submission";

const VALID = {
  userId: 5,
  date: "2026-09-20",
  time: "14:00",
  description: "Discuss the upcoming ScriptTrainer release",
};

describe("MeetingSubmissionSchema", () => {
  it("accepts a complete submission", () => {
    const result = MeetingSubmissionSchema.safeParse(VALID);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(VALID);
  });

  it("trims the description", () => {
    const result = MeetingSubmissionSchema.safeParse({
      ...VALID,
      description: "  Kickoff call  ",
    });

    expect(result.data?.description).toBe("Kickoff call");
  });

  describe("userId", () => {
    it.each([
      ["missing", undefined],
      ["null", null],
      ["zero", 0],
      ["negative", -1],
      ["fractional", 1.5],
      ["a string", "5"],
    ])("rejects %s", (_label, userId) => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, userId }).success,
      ).toBe(false);
    });
  });

  describe("date and time are required, unlike the extraction schema", () => {
    // meetings.date and meetings.time are NOT NULL, so a recording that never
    // stated them has to be completed by a human before it can be saved.
    it("rejects a null date", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, date: null }).success,
      ).toBe(false);
    });

    it("rejects an empty date", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, date: "" }).success,
      ).toBe(false);
    });

    it("rejects a null time", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, time: null }).success,
      ).toBe(false);
    });

    it("rejects an empty time", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, time: "" }).success,
      ).toBe(false);
    });
  });

  describe("date format", () => {
    it.each(["September 20, 2026", "20/09/2026", "2026-9-20", "next Friday"])(
      "rejects %s",
      (date) => {
        expect(MeetingSubmissionSchema.safeParse({ ...VALID, date }).success).toBe(
          false,
        );
      },
    );

    it("rejects a well-formed but impossible date", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, date: "2026-02-31" })
          .success,
      ).toBe(false);
    });

    it("accepts a leap day", () => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, date: "2028-02-29" })
          .success,
      ).toBe(true);
    });
  });

  describe("time format", () => {
    it.each(["00:00", "09:05", "23:59"])("accepts %s", (time) => {
      expect(MeetingSubmissionSchema.safeParse({ ...VALID, time }).success).toBe(
        true,
      );
    });

    it.each(["2:00 PM", "24:00", "14:60", "1400", "14:00:00"])(
      "rejects %s",
      (time) => {
        expect(MeetingSubmissionSchema.safeParse({ ...VALID, time }).success).toBe(
          false,
        );
      },
    );
  });

  describe("description", () => {
    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["null", null],
    ])("rejects %s", (_label, description) => {
      expect(
        MeetingSubmissionSchema.safeParse({ ...VALID, description }).success,
      ).toBe(false);
    });

    it("rejects one over the length cap", () => {
      expect(
        MeetingSubmissionSchema.safeParse({
          ...VALID,
          description: "x".repeat(2001),
        }).success,
      ).toBe(false);
    });

    it("accepts one at the cap", () => {
      expect(
        MeetingSubmissionSchema.safeParse({
          ...VALID,
          description: "x".repeat(2000),
        }).success,
      ).toBe(true);
    });
  });

  it("produces messages written for a person to read", () => {
    const result = MeetingSubmissionSchema.safeParse({
      userId: null,
      date: "",
      time: "",
      description: "",
    });

    const messages = result.error?.issues.map((issue) => issue.message) ?? [];

    // These are surfaced verbatim in the API error, so they must not leak
    // internal rule names or the offending values.
    expect(messages).toContain("Choose who this meeting is for");
    expect(messages.every((message) => !message.includes("Expected"))).toBe(true);
  });
});

describe("SavedMeetingRowSchema", () => {
  const VALID_ROW = {
    id: 1,
    user_id: 5,
    fname: "Eric",
    lname: "Poe",
    date: "2026-09-20",
    time: "14:00",
    description: "Kickoff",
    created_at: "2026-09-14T07:45:40Z",
  };

  it("accepts the shape the insert query returns", () => {
    expect(SavedMeetingRowSchema.safeParse(VALID_ROW).success).toBe(true);
  });

  it("rejects a raw Postgres time that was not cast to HH:mm", () => {
    // Guards the `to_char(..., 'HH24:MI')` cast in the insert query.
    expect(
      SavedMeetingRowSchema.safeParse({ ...VALID_ROW, time: "14:00:00" }).success,
    ).toBe(false);
  });

  it("rejects a Date object where a formatted string was expected", () => {
    // Guards against the driver's default DATE parsing sneaking back in.
    expect(
      SavedMeetingRowSchema.safeParse({
        ...VALID_ROW,
        date: new Date("2026-09-20"),
      }).success,
    ).toBe(false);
  });
});
