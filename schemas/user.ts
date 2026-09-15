import { z } from "zod";

/**
 * Zod schemas for the `users` table.
 *
 * `pg` returns loosely typed rows — it has no knowledge of the table shape — so
 * a row is validated like any other external input. A column rename or type
 * change then surfaces as an explicit validation error instead of an `undefined`
 * travelling into the UI.
 */

/** Raw shape of a candidate row, including the matching signals from SQL. */
export const UserCandidateRowSchema = z.object({
  id: z.number().int().positive(),
  fname: z.string().min(1),
  lname: z.string().min(1),
  exact_full_name: z.boolean(),
  exact_reversed_name: z.boolean(),
  exact_name_part: z.boolean(),
  // Postgres `real` arrives as a JS number; NULL is possible when similarity
  // was not computed for a row that matched on an exact condition.
  trigram_similarity: z.number().nullable(),
});

export type UserCandidateRow = z.infer<typeof UserCandidateRowSchema>;

export const UserRowSchema = z.object({
  id: z.number().int().positive(),
  fname: z.string().min(1),
  lname: z.string().min(1),
});

export type UserRow = z.infer<typeof UserRowSchema>;

/** Query string accepted by `GET /api/users/search`. */
export const UserSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "A search term is required")
    .max(120, "That search term is too long"),
});
