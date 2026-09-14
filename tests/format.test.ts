import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatMeetingDate,
  formatMeetingTime,
  toLocalIsoString,
} from "@/lib/format";

describe("formatMeetingDate", () => {
  it("renders an ISO date in long form", () => {
    expect(formatMeetingDate("2026-09-20")).toBe("September 20, 2026");
  });

  it("does not shift the date across a timezone boundary", () => {
    // A naive `new Date("2026-01-01")` renders as December 31 west of UTC.
    expect(formatMeetingDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatMeetingDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("passes null through", () => {
    expect(formatMeetingDate(null)).toBe(null);
  });

  it("passes unrecognised input through unchanged", () => {
    expect(formatMeetingDate("next Friday")).toBe("next Friday");
  });
});

describe("formatMeetingTime", () => {
  it.each([
    ["14:00", "2:00 PM"],
    ["09:05", "9:05 AM"],
    ["00:00", "12:00 AM"],
    ["00:30", "12:30 AM"],
    ["12:00", "12:00 PM"],
    ["12:45", "12:45 PM"],
    ["23:59", "11:59 PM"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatMeetingTime(input)).toBe(expected);
  });

  it("passes null through", () => {
    expect(formatMeetingTime(null)).toBe(null);
  });

  it("passes unrecognised input through unchanged", () => {
    expect(formatMeetingTime("half past two")).toBe("half past two");
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [7, "0:07"],
    [59, "0:59"],
    [60, "1:00"],
    [95, "1:35"],
    [120, "2:00"],
  ])("renders %i seconds as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it("clamps negative input", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("toLocalIsoString", () => {
  it("produces an ISO 8601 timestamp that keeps the local offset", () => {
    const formatted = toLocalIsoString(new Date());

    expect(formatted).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  it("reports the local wall clock rather than UTC", () => {
    const date = new Date(2026, 8, 9, 17, 20, 0);
    const formatted = toLocalIsoString(date);

    // Independent of the machine's zone: the rendered parts must match the
    // Date object's own local getters.
    expect(formatted.startsWith("2026-09-09T17:20:00")).toBe(true);
  });

  it("stays parseable back to the same instant", () => {
    const date = new Date(2026, 8, 9, 17, 20, 0);

    expect(Date.parse(toLocalIsoString(date))).toBe(date.getTime());
  });
});
