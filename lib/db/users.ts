import "server-only";

import { query } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import {
  MIN_TRIGRAM_SIMILARITY,
  formatUserLabel,
  normalizeName,
  resolveCandidates,
  scoreCandidate,
  type NameResolution,
  type UserCandidate,
} from "@/lib/matching/name-match";
import {
  UserCandidateRowSchema,
  UserRowSchema,
  type UserCandidateRow,
  type UserRow,
} from "@/schemas/user";

/** Rows fetched before ranking. Wider than what the UI shows, so the pure
 *  ranking layer has something to sort rather than trusting SQL's ordering. */
const CANDIDATE_FETCH_LIMIT = 25;

/**
 * Finds users who might be the person named in a transcript.
 *
 * SQL does the filtering because it owns the trigram index; the scoring and the
 * resolved/ambiguous decision live in `lib/matching/name-match.ts` so they stay
 * unit testable. The normalisation expression here must match the
 * `normalize_name` function defined in db/init/01-schema.sql.
 */
const SEARCH_CANDIDATES_SQL = `
  SELECT
    id,
    fname,
    lname,
    normalize_name(fname || ' ' || lname) = $1 AS exact_full_name,
    normalize_name(lname || ' ' || fname) = $1 AS exact_reversed_name,
    (normalize_name(fname) = $1 OR normalize_name(lname) = $1) AS exact_name_part,
    similarity(normalize_name(fname || ' ' || lname), $1) AS trigram_similarity
  FROM users
  WHERE
    normalize_name(fname || ' ' || lname) = $1
    OR normalize_name(lname || ' ' || fname) = $1
    OR normalize_name(fname) = $1
    OR normalize_name(lname) = $1
    OR similarity(normalize_name(fname || ' ' || lname), $1) >= $2
  ORDER BY similarity(normalize_name(fname || ' ' || lname), $1) DESC
  LIMIT $3
`;

function toCandidate(row: UserCandidateRow): UserCandidate {
  return {
    id: row.id,
    fname: row.fname,
    lname: row.lname,
    label: formatUserLabel(row.fname, row.lname),
    score: scoreCandidate({
      exactFullName: row.exact_full_name,
      exactReversedName: row.exact_reversed_name,
      exactNamePart: row.exact_name_part,
      trigramSimilarity: row.trigram_similarity ?? 0,
    }),
  };
}

/**
 * Resolves a spoken or typed name to ranked candidates.
 *
 * An empty or punctuation-only term returns `unresolved` without touching the
 * database — a transcript that stated no name should not trigger a search.
 */
export async function searchUsersByName(name: string): Promise<NameResolution> {
  const normalized = normalizeName(name);

  if (normalized.length === 0) {
    return { status: "unresolved", selectedUserId: null, candidates: [] };
  }

  const rows = await query(SEARCH_CANDIDATES_SQL, [
    normalized,
    MIN_TRIGRAM_SIMILARITY,
    CANDIDATE_FETCH_LIMIT,
  ]);

  const candidates = rows.map((row) =>
    toCandidate(UserCandidateRowSchema.parse(row)),
  );

  return resolveCandidates(candidates);
}

/**
 * Confirms a user exists before a meeting is attached to them.
 *
 * The foreign key would reject an unknown id anyway, but checking first turns a
 * constraint violation into a clear 404 rather than a generic database error.
 */
export async function findUserById(id: number): Promise<UserRow | null> {
  const rows = await query("SELECT id, fname, lname FROM users WHERE id = $1", [
    id,
  ]);

  if (rows.length === 0) return null;

  return UserRowSchema.parse(rows[0]);
}

export async function requireUserById(id: number): Promise<UserRow> {
  const user = await findUserById(id);

  if (user === null) {
    throw new AppError({
      code: "not_found",
      status: 404,
      publicMessage:
        "That person is no longer in the directory. Please pick someone else.",
      detail: `user id ${id} not found`,
    });
  }

  return user;
}
