/**
 * Shared format primitives.
 *
 * Extracted into their own module so both the extraction schema (where a value
 * may be absent) and the submission schema (where it may not) can depend on the
 * same definitions without importing each other.
 */

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Rejects well-formed but impossible dates such as `2026-02-31`, which a regex
 * alone will happily accept.
 */
export function isRealCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));

  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

/**
 * Placeholders a model sometimes emits instead of leaving a field empty.
 *
 * Under the empty-string convention these are especially important: a literal
 * "unknown" would otherwise be treated as a real value and used as a search
 * filter, quietly returning zero matches.
 */
const PLACEHOLDER_VALUES = new Set([
  "null",
  "none",
  "n/a",
  "na",
  "unknown",
  "not specified",
  "not mentioned",
  "not provided",
  "not stated",
  "undefined",
  "empty",
  "-",
]);

/**
 * Collapses anything that means "nothing was said" to an empty string.
 *
 * Absent keys, nulls, whitespace and placeholder words all normalise to `""`,
 * which is the convention the whole conversational flow relies on: empty means
 * "not stated in this turn", and never overwrites accumulated state.
 */
export function normalizeOptionalText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return "";

  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return "";

  return trimmed;
}

/** Pads `2026-9-20` to `2026-09-20`. Leaves anything else for Zod to reject. */
export function normalizeDateValue(value: unknown): string {
  const text = normalizeOptionalText(value);
  if (text === "") return "";

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return text;

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Pads `9:30` to `09:30` and drops a trailing `:ss`. */
export function normalizeTimeValue(value: unknown): string {
  const text = normalizeOptionalText(value);
  if (text === "") return "";

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (!match) return text;

  const [, hours, minutes] = match;
  return `${hours.padStart(2, "0")}:${minutes}`;
}

/** Lowercases an email so stored and spoken forms compare equal. */
export function normalizeEmailValue(value: unknown): string {
  return normalizeOptionalText(value).toLowerCase().replace(/\s+/g, "");
}

/**
 * Reduces a phone number to digits.
 *
 * The directory stores formatted numbers like `+1 (512) 555-0101` while speech
 * produces "five five five, oh one oh one" or `5125550101`. Comparing digits
 * only is the sole reliable option.
 */
export function normalizePhoneValue(value: unknown): string {
  return normalizeOptionalText(value).replace(/\D+/g, "");
}

/** Last 10 digits, so a number with a country code still matches one without. */
export function phoneMatchKey(value: unknown): string {
  const digits = normalizePhoneValue(value);
  return digits.length > 10 ? digits.slice(-10) : digits;
}
