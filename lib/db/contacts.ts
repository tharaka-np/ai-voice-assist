import "server-only";

import { MAX_CONTACT_RESULTS, MIN_FIELD_SIMILARITY } from "@/lib/config";
import { query } from "@/lib/db/client";
import {
  buildContactFilters,
  countActiveFilters,
  expandStateForms,
  formatUserLabel,
  idleSearchOutcome,
  isFuzzyContactField,
  matchedFieldsFrom,
  resolveContactSearch,
  scoreContact,
  type ContactCandidate,
  type ContactFilters,
  type ContactSearchOutcome,
  type FieldScores,
} from "@/lib/matching/contact-match";
import { CONTACT_FIELDS, type ConversationState } from "@/schemas/meeting-request";
import { ContactRowSchema, type ContactRow } from "@/schemas/user";

/**
 * Directory search across every supplied contact field.
 *
 * Filters are ANDed: each turn of the conversation either adds a constraint or
 * leaves the set alone, which is what makes the result count fall monotonically
 * as the user supplies more detail.
 *
 * The SQL is assembled from a fixed set of fragments with every value passed as a
 * bound parameter. No user or model input is ever interpolated into the statement
 * text.
 */

/** Maps a filter key to the column it constrains. */
const COLUMN_BY_FIELD: Readonly<Record<string, string>> = {
  fname: "fname",
  lname: "lname",
  city: "city",
  street: "street",
  state: "state",
};

type QueryPlan = {
  sql: string;
  params: unknown[];
  /** Per-field score expressions, aliased so the row can be scored in TypeScript. */
  scoreAliases: string[];
};

function buildQueryPlan(filters: ContactFilters): QueryPlan {
  const params: unknown[] = [];
  const conditions: string[] = [];
  const selections: string[] = [];
  const scoreAliases: string[] = [];

  /** Binds a value and returns its positional placeholder. */
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  /**
   * Binds the similarity floor on first use only.
   *
   * Binding it up front broke every query that filtered solely on exact fields
   * such as email: the parameter was sent but never referenced, leaving Postgres
   * with no context to infer its type and failing with "could not determine data
   * type of parameter $1".
   */
  let similarityFloorPlaceholder: string | null = null;
  const similarityFloor = (): string => {
    similarityFloorPlaceholder ??= `${bind(MIN_FIELD_SIMILARITY)}::real`;
    return similarityFloorPlaceholder;
  };

  for (const field of CONTACT_FIELDS) {
    const value = filters[field];
    if (value === undefined) continue;

    // Score aliases are quoted so Postgres preserves their case. Unquoted
    // identifiers fold to lower case, which would turn `score_phoneNumber` into
    // `score_phonenumber` and stop the row reader from finding it.
    if (field === "email") {
      const placeholder = bind(value);
      conditions.push(`lower(users.email) = ${placeholder}::text`);
      selections.push(`1::real AS "score_email"`);
      scoreAliases.push("email");
      continue;
    }

    if (field === "phoneNumber") {
      const placeholder = bind(value);
      // Compare the last ten digits on both sides so formatting and country
      // codes cannot cause a false negative.
      conditions.push(
        `right(regexp_replace(users.phone_number, '\\D', '', 'g'), 10) = right(${placeholder}::text, 10)`,
      );
      selections.push(`1::real AS "score_phoneNumber"`);
      scoreAliases.push("phoneNumber");
      continue;
    }

    if (field === "gender") {
      const placeholder = bind(value);
      conditions.push(`users.gender = ${placeholder}::text`);
      selections.push(`1::real AS "score_gender"`);
      scoreAliases.push("gender");
      continue;
    }

    if (!isFuzzyContactField(field)) continue;

    const column = COLUMN_BY_FIELD[field];
    const normalized = `normalize_name(users.${column})`;

    if (field === "state") {
      // Accept the spoken form and its postal abbreviation, plus a fuzzy fallback
      // for regions outside the abbreviation table.
      const forms = expandStateForms(value);
      const placeholder = bind(forms.length > 0 ? forms : [value]);
      const fuzzy = bind(value);

      conditions.push(
        `(${normalized} = ANY(${placeholder}::text[]) OR similarity(${normalized}, ${fuzzy}::text) >= ${similarityFloor()})`,
      );
      selections.push(
        `GREATEST(
           CASE WHEN ${normalized} = ANY(${placeholder}::text[]) THEN 1::real ELSE 0::real END,
           similarity(${normalized}, ${fuzzy}::text)
         ) AS "score_state"`,
      );
      scoreAliases.push("state");
      continue;
    }

    const placeholder = bind(value);
    conditions.push(
      `(${normalized} = ${placeholder}::text OR similarity(${normalized}, ${placeholder}::text) >= ${similarityFloor()})`,
    );
    selections.push(
      `GREATEST(
         CASE WHEN ${normalized} = ${placeholder}::text THEN 1::real ELSE 0::real END,
         similarity(${normalized}, ${placeholder}::text)
       ) AS "score_${field}"`,
    );
    scoreAliases.push(field);
  }

  const limitPlaceholder = bind(MAX_CONTACT_RESULTS);

  const relevance =
    scoreAliases.length > 0
      ? scoreAliases.map((alias) => `COALESCE("score_${alias}", 0)`).join(" + ")
      : "0";

  // Scored in an inner query and ordered in the outer one.
  //
  // Postgres allows a bare output-column name in ORDER BY but not one used inside
  // an expression, so `ORDER BY (COALESCE(score_fname, 0) + ...)` fails with
  // "column score_fname does not exist". Wrapping makes the aliases real input
  // columns for the outer query.
  //
  // `count(*) OVER ()` stays in the inner query, where it sees every matching row.
  // The LIMIT is applied outside it, so the total remains accurate even though
  // only MAX_CONTACT_RESULTS rows travel to the browser.
  const sql = `
    SELECT * FROM (
      SELECT
        users.id,
        users.fname,
        users.lname,
        users.street,
        users.city,
        users.state,
        users.phone_number,
        users.email,
        users.gender,
        count(*) OVER () AS total_matches
        ${selections.length > 0 ? `, ${selections.join(", ")}` : ""}
      FROM users
      WHERE ${conditions.length > 0 ? conditions.join(" AND ") : "TRUE"}
    ) AS scored
    ORDER BY (${relevance}) DESC, scored.lname ASC, scored.fname ASC, scored.id ASC
    LIMIT ${limitPlaceholder}
  `;

  return { sql, params, scoreAliases };
}

function toCandidate(row: ContactRow, scoreAliases: string[]): ContactCandidate {
  const fieldScores: FieldScores = {};

  for (const alias of scoreAliases) {
    const raw = row[`score_${alias}` as keyof ContactRow];
    if (typeof raw === "number") {
      fieldScores[alias as keyof FieldScores] = raw;
    }
  }

  return {
    id: row.id,
    fname: row.fname,
    lname: row.lname,
    street: row.street,
    city: row.city,
    state: row.state,
    phoneNumber: row.phone_number,
    email: row.email,
    gender: row.gender,
    label: formatUserLabel(row.fname, row.lname),
    score: scoreContact(fieldScores),
    matchedFields: matchedFieldsFrom(fieldScores),
  };
}

/**
 * Runs the directory search for the current accumulated state.
 *
 * Returns `idle` without touching the database when no contact field has been
 * supplied yet: a turn that only mentioned meeting details should not trigger a
 * search that would match the entire directory.
 */
export async function searchContacts(
  state: ConversationState,
): Promise<ContactSearchOutcome> {
  const filters = buildContactFilters(state);

  if (countActiveFilters(filters) === 0) return idleSearchOutcome;

  const { sql, params, scoreAliases } = buildQueryPlan(filters);
  const rows = await query(sql, params);

  if (rows.length === 0) return resolveContactSearch(0, []);

  const parsed = rows.map((row) => ContactRowSchema.parse(row));
  const total = Number(parsed[0].total_matches ?? parsed.length);

  return resolveContactSearch(
    total,
    parsed.map((row) => toCandidate(row, scoreAliases)),
  );
}
