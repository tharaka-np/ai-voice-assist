import "server-only";

import { query } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { UserRowSchema, type UserRow } from "@/schemas/user";

/**
 * Single-user lookups.
 *
 * Directory *searching* lives in `lib/db/contacts.ts`, which owns the multi-field
 * conversational query. This module only answers "does this id exist", which is
 * what the meeting write path needs.
 */

export async function findUserById(id: number): Promise<UserRow | null> {
  const rows = await query("SELECT id, fname, lname FROM users WHERE id = $1", [
    id,
  ]);

  if (rows.length === 0) return null;

  return UserRowSchema.parse(rows[0]);
}

/**
 * Confirms a user exists before a meeting is attached to them.
 *
 * The foreign key would reject an unknown id anyway, but checking first turns a
 * constraint violation into a clear 404 rather than a generic database error.
 */
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
