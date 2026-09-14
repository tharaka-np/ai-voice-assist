import { HH_MM_PATTERN, ISO_DATE_PATTERN } from "@/schemas/meeting";

/**
 * Presentation helpers. Pure and deterministic so they can run in a server
 * component, a client component or a unit test with identical results.
 *
 * The machine formats (`YYYY-MM-DD`, `HH:mm`) stay canonical in the API
 * response; these functions only affect what a human reads.
 */

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  // Date-only values must not be shifted by the runtime's local offset.
  timeZone: "UTC",
});

/** `2026-09-20` -> `September 20, 2026`. Unrecognised input is passed through. */
export function formatMeetingDate(value: string | null): string | null {
  if (value === null) return null;
  if (!ISO_DATE_PATTERN.test(value)) return value;

  const [year, month, day] = value.split("-").map(Number);
  return DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

/** `14:00` -> `2:00 PM`. Unrecognised input is passed through. */
export function formatMeetingTime(value: string | null): string | null {
  if (value === null) return null;
  if (!HH_MM_PATTERN.test(value)) return value;

  const [hours, minutes] = value.split(":").map(Number);
  const period = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/** Seconds to `m:ss`, for the recording timer. */
export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * ISO 8601 timestamp that keeps the browser's local offset, e.g.
 * `2026-09-09T17:20:00+05:30`.
 *
 * `Date.prototype.toISOString` would normalise to UTC and lose the offset. The
 * extraction step resolves phrases like "tomorrow at 2" against this value, so
 * the user's own wall clock is the part that matters.
 */
export function toLocalIsoString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);

  const calendarDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const wallClock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;

  return `${calendarDate}T${wallClock}${offset}`;
}

/** Best-effort IANA timezone for the current browser, falling back to UTC. */
export function resolveBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
