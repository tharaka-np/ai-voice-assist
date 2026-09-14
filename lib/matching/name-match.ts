/**
 * Name resolution policy.
 *
 * Pure and free of database imports so the ranking rules can be unit tested
 * without a running Postgres. SQL does the filtering (it has the trigram index);
 * this module decides what the results *mean*.
 *
 * The governing rule, from the design document: the model proposes a name
 * string, and only the database resolves an identifier. Nothing here consults an
 * AI-supplied confidence score.
 */

/** Below this, a trigram match is treated as noise rather than a candidate. */
export const MIN_TRIGRAM_SIMILARITY = 0.35;

/** A single high-scoring candidate above this is safe to preselect. */
export const AUTO_SELECT_SCORE = 0.95;

/** Ceiling on how many candidates the UI is asked to show. */
export const MAX_CANDIDATES = 8;

/**
 * Lowercases, strips punctuation and collapses whitespace.
 *
 * Mirrors the `normalize_name` SQL function in db/init/01-schema.sql. The two
 * must stay in step: if they diverge, an exact match gets scored as fuzzy.
 * `\p{L}\p{N}` keeps accented letters, which a plain `a-z` class would discard.
 */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Raw per-row signals returned by the search query. */
export type CandidateSignals = {
  /** Normalised "fname lname" equals the query. */
  exactFullName: boolean;
  /** Normalised "lname fname" equals the query — a spoken "Wilson, Amanda". */
  exactReversedName: boolean;
  /** The query equals just the first name or just the last name. */
  exactNamePart: boolean;
  /** Postgres trigram similarity, 0 to 1. */
  trigramSimilarity: number;
};

export type UserCandidate = {
  id: number;
  fname: string;
  lname: string;
  /** Display label, built server-side so the UI never concatenates names. */
  label: string;
  score: number;
};

/**
 * Collapses the signals into one score.
 *
 * Tiered rather than weighted so an exact match always beats a fuzzy one, per
 * §9.1 of the design document. Fuzzy scores are capped below the lowest exact
 * tier, which means a very close trigram match can never outrank a real one.
 */
export function scoreCandidate(signals: CandidateSignals): number {
  if (signals.exactFullName) return 1;
  if (signals.exactReversedName) return 0.9;
  if (signals.exactNamePart) return 0.8;

  return Math.min(0.79, Math.max(0, signals.trigramSimilarity));
}

export type ResolutionStatus = "resolved" | "ambiguous" | "unresolved";

export type NameResolution = {
  status: ResolutionStatus;
  /** Preselected user, or null whenever the choice belongs to the human. */
  selectedUserId: number | null;
  candidates: UserCandidate[];
};

/**
 * Decides whether a match is good enough to preselect.
 *
 * Deliberately conservative. A single confident hit is preselected but stays
 * visible and changeable; anything else is handed to the user. Ambiguity is never
 * resolved silently, because attaching a meeting to the wrong person is worse
 * than asking a question.
 */
export function resolveCandidates(
  candidates: readonly UserCandidate[],
): NameResolution {
  const ranked = [...candidates]
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.lname.localeCompare(b.lname) ||
        a.fname.localeCompare(b.fname) ||
        a.id - b.id,
    )
    .slice(0, MAX_CANDIDATES);

  if (ranked.length === 0) {
    return { status: "unresolved", selectedUserId: null, candidates: [] };
  }

  const confident = ranked.filter(
    (candidate) => candidate.score >= AUTO_SELECT_SCORE,
  );

  // Exactly one confident hit, and nothing else competing at that level.
  if (confident.length === 1) {
    return {
      status: "resolved",
      selectedUserId: confident[0].id,
      candidates: ranked,
    };
  }

  return { status: "ambiguous", selectedUserId: null, candidates: ranked };
}

/** Display form used everywhere a candidate is shown. */
export function formatUserLabel(fname: string, lname: string): string {
  return `${fname} ${lname}`.replace(/\s+/g, " ").trim();
}
