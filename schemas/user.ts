import { z } from "zod";

import { GENDER_VALUES } from "@/schemas/meeting-request";

/**
 * Zod schemas for the `users` table.
 *
 * `pg` returns loosely typed rows — it has no knowledge of the table shape — so a
 * row is validated like any other external input. A column rename or type change
 * then surfaces as an explicit validation error instead of an `undefined`
 * travelling into the UI.
 */

export const UserRowSchema = z.object({
  id: z.number().int().positive(),
  fname: z.string().min(1),
  lname: z.string().min(1),
});

export type UserRow = z.infer<typeof UserRowSchema>;

/**
 * A directory row plus the search metadata the query computes.
 *
 * The `score_*` columns are present only for the fields that were actually
 * filtered on, so each is optional. `total_matches` comes from `count(*) OVER ()`
 * and arrives as a string, because Postgres `bigint` exceeds the range JavaScript
 * numbers represent exactly and `pg` refuses to lose precision silently.
 */
export const ContactRowSchema = z.object({
  id: z.number().int().positive(),
  fname: z.string().min(1),
  lname: z.string().min(1),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  phone_number: z.string(),
  email: z.string(),
  gender: z.enum(GENDER_VALUES),

  total_matches: z.union([z.string(), z.number()]).nullable().optional(),

  score_fname: z.number().nullable().optional(),
  score_lname: z.number().nullable().optional(),
  score_city: z.number().nullable().optional(),
  score_street: z.number().nullable().optional(),
  score_state: z.number().nullable().optional(),
  score_email: z.number().nullable().optional(),
  score_phoneNumber: z.number().nullable().optional(),
  score_gender: z.number().nullable().optional(),
});

export type ContactRow = z.infer<typeof ContactRowSchema>;
