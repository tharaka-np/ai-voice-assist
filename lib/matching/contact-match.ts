import { MATCH_THRESHOLD } from "@/lib/config";
import { normalizeEmailValue, phoneMatchKey } from "@/schemas/patterns";
import {
  CONTACT_FIELDS,
  type ContactField,
  type ConversationState,
} from "@/schemas/meeting-request";

/**
 * Contact matching policy.
 *
 * Pure and free of database imports so the ranking and threshold rules can be
 * unit tested without a running Postgres. SQL does the filtering — it owns the
 * trigram index — and this module decides what the results mean.
 *
 * The governing rule is unchanged from the single-name flow: the model proposes
 * field values, and only the database resolves them to a record id. Nothing here
 * consults a model-generated confidence score.
 */

/**
 * Lowercases, strips punctuation and collapses whitespace.
 *
 * Mirrors the `normalize_name` SQL function in db/init/01-schema.sql. The two must
 * stay in step: if they diverge, an exact match gets scored as fuzzy.
 * `\p{L}\p{N}` keeps accented letters, which a plain `a-z` class would discard.
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display form used everywhere a contact is shown. */
export function formatUserLabel(fname: string, lname: string): string {
  return `${fname} ${lname}`.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Which fields are matched fuzzily. Names and places are spoken aloud and get
 * misheard, so they need tolerance. Email, phone and gender do not: a
 * near-miss email is a different person, not the same one spelled badly.
 */
export const FUZZY_CONTACT_FIELDS = [
  "fname",
  "lname",
  "city",
  "street",
  "state",
] as const satisfies readonly ContactField[];

export type FuzzyContactField = (typeof FUZZY_CONTACT_FIELDS)[number];

export function isFuzzyContactField(
  field: ContactField,
): field is FuzzyContactField {
  return FUZZY_CONTACT_FIELDS.some((candidate) => candidate === field);
}

export type ContactFilters = Partial<Record<ContactField, string>>;

/**
 * Reduces accumulated state to the filters worth querying on.
 *
 * Only non-empty contact fields are included, which is what makes progressive
 * narrowing work: each turn either adds a filter or leaves the set alone. Meeting
 * fields are excluded by construction — they describe what to schedule, not who
 * to find.
 */
export function buildContactFilters(state: ConversationState): ContactFilters {
  const filters: ContactFilters = {};

  for (const field of CONTACT_FIELDS) {
    const raw = state[field];
    if (raw === "") continue;

    if (field === "email") {
      filters.email = normalizeEmailValue(raw);
    } else if (field === "phoneNumber") {
      // Last ten digits, so a spoken number without a country code still
      // matches a stored "+1 (512) 555-0101".
      filters.phoneNumber = phoneMatchKey(raw);
    } else if (field === "gender") {
      filters.gender = raw.toLowerCase();
    } else {
      filters[field] = normalizeName(raw);
    }
  }

  // A filter that normalises away to nothing would match every row, which is
  // worse than not filtering at all because it looks deliberate.
  for (const field of CONTACT_FIELDS) {
    if (filters[field] === "") delete filters[field];
  }

  return filters;
}

export function countActiveFilters(filters: ContactFilters): number {
  return CONTACT_FIELDS.filter((field) => filters[field] !== undefined).length;
}

// ---------------------------------------------------------------------------
// US state abbreviations
// ---------------------------------------------------------------------------

/**
 * The directory stores states as postal abbreviations while people say the full
 * name. Trigram similarity cannot bridge "texas" and "tx", so the spoken form is
 * expanded into every accepted spelling before the query runs.
 *
 * Non-US regions in the directory, such as Colombo's "Western" province, fall
 * through unchanged and are matched by the normal exact-or-fuzzy path.
 */
const US_STATE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar",
  california: "ca", colorado: "co", connecticut: "ct", delaware: "de",
  "district of columbia": "dc", florida: "fl", georgia: "ga", hawaii: "hi",
  idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks",
  kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms",
  missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm",
  "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh",
  oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri",
  "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx",
  utah: "ut", vermont: "vt", virginia: "va", washington: "wa",
  "west virginia": "wv", wisconsin: "wi", wyoming: "wy",
};

/** Every spelling a spoken state should be accepted under, already normalised. */
export function expandStateForms(value: string): string[] {
  const normalized = normalizeName(value);
  if (normalized === "") return [];

  const forms = new Set<string>([normalized]);

  const abbreviation = US_STATE_ABBREVIATIONS[normalized];
  if (abbreviation !== undefined) forms.add(abbreviation);

  for (const [full, short] of Object.entries(US_STATE_ABBREVIATIONS)) {
    if (short === normalized) forms.add(full);
  }

  return [...forms];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type ContactRecord = {
  id: number;
  fname: string;
  lname: string;
  street: string;
  city: string;
  state: string;
  phoneNumber: string;
  email: string;
  gender: "male" | "female";
};

export type ContactCandidate = ContactRecord & {
  /** Built server-side so the UI never concatenates names itself. */
  label: string;
  score: number;
  /** Which filters this row actually satisfied, for the UI to explain a match. */
  matchedFields: ContactField[];
};

/** Per-field similarity, 0 to 1, for the filters that were applied. */
export type FieldScores = Partial<Record<ContactField, number>>;

/**
 * Averages the per-field scores.
 *
 * A mean rather than a sum, so a row matching one filter perfectly is not ranked
 * below a row matching three filters loosely. Exact matches contribute 1, which
 * preserves the property that an exact match cannot lose to a fuzzy one when the
 * same filters are in play.
 */
export function scoreContact(fieldScores: FieldScores): number {
  const values = CONTACT_FIELDS.map((field) => fieldScores[field]).filter(
    (value): value is number => typeof value === "number",
  );

  if (values.length === 0) return 0;

  const total = values.reduce((sum, value) => sum + Math.min(1, Math.max(0, value)), 0);
  return total / values.length;
}

export function matchedFieldsFrom(fieldScores: FieldScores): ContactField[] {
  return CONTACT_FIELDS.filter((field) => {
    const value = fieldScores[field];
    return typeof value === "number" && value > 0;
  });
}

// ---------------------------------------------------------------------------
// Threshold outcome
// ---------------------------------------------------------------------------

/**
 * `refine` — too many matches; ask for another detail.
 * `select` — few enough to choose from.
 * `empty`  — nothing matched the current filters.
 * `idle`   — no contact filters supplied yet, so no search has run.
 */
export type SearchMode = "idle" | "refine" | "select" | "empty";

export type ContactSearchOutcome = {
  mode: SearchMode;
  /** Rows matching in the database, before the display cap. */
  total: number;
  /** Echoed so the UI never hardcodes the threshold. */
  threshold: number;
  contacts: ContactCandidate[];
  /** Preselected only when a single row remains. Never a guess between several. */
  selectedContactId: number | null;
};

export const idleSearchOutcome: ContactSearchOutcome = {
  mode: "idle",
  total: 0,
  threshold: MATCH_THRESHOLD,
  contacts: [],
  selectedContactId: null,
};

/**
 * Applies the threshold rule.
 *
 * The comparison is `total >= threshold`, so a threshold of 5 keeps refinement
 * active at exactly five matches and offers selection at four. Ranking happens
 * here rather than in SQL because the score is computed in TypeScript.
 */
export function resolveContactSearch(
  total: number,
  contacts: readonly ContactCandidate[],
  threshold: number = MATCH_THRESHOLD,
): ContactSearchOutcome {
  const ranked = [...contacts].sort(
    (a, b) =>
      b.score - a.score ||
      a.lname.localeCompare(b.lname) ||
      a.fname.localeCompare(b.fname) ||
      a.id - b.id,
  );

  if (total === 0) {
    return { mode: "empty", total: 0, threshold, contacts: [], selectedContactId: null };
  }

  if (total >= threshold) {
    // Rows are still returned so the UI can preview who is in the running, but
    // the mode tells it to ask for another detail rather than offer selection.
    return { mode: "refine", total, threshold, contacts: ranked, selectedContactId: null };
  }

  return {
    mode: "select",
    total,
    threshold,
    contacts: ranked,
    selectedContactId: ranked.length === 1 ? ranked[0].id : null,
  };
}
