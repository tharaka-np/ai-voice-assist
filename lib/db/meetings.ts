import "server-only";

import { query } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { formatUserLabel } from "@/lib/matching/name-match";
import {
  SavedMeetingRowSchema,
  type MeetingSubmission,
} from "@/schemas/meeting-submission";
import type { SavedMeeting } from "@/types/api";

/**
 * Inserts the meeting and returns it joined to its user, in one round trip.
 *
 * Every column is cast to text in SQL on the way out:
 *
 *   * `DATE` would otherwise arrive as a JS `Date` at local midnight, which can
 *     render as the previous day west of UTC — the same bug `formatMeetingDate`
 *     already guards against on the display side.
 *   * `TIME` would arrive as `14:00:00`; the app's canonical form is `HH:mm`.
 *   * `created_at` is pinned to UTC so the value is unambiguous.
 *
 * Storing wall-clock date and time with no offset is deliberate: the `meetings`
 * table has no timezone column, so what is saved is exactly what the user
 * confirmed on screen.
 */
const INSERT_MEETING_SQL = `
  WITH inserted AS (
    INSERT INTO meetings (user_id, "date", "time", description)
    VALUES ($1, $2::date, $3::time, $4)
    RETURNING id, user_id, "date", "time", description, created_at
  )
  SELECT
    inserted.id,
    inserted.user_id,
    users.fname,
    users.lname,
    to_char(inserted."date", 'YYYY-MM-DD') AS date,
    to_char(inserted."time", 'HH24:MI') AS time,
    inserted.description,
    to_char(inserted.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
  FROM inserted
  JOIN users ON users.id = inserted.user_id
`;

export async function insertMeeting(
  submission: MeetingSubmission,
): Promise<SavedMeeting> {
  const rows = await query(INSERT_MEETING_SQL, [
    submission.userId,
    submission.date,
    submission.time,
    submission.description,
  ]);

  if (rows.length === 0) {
    throw new AppError({
      code: "database_error",
      status: 500,
      publicMessage: "We couldn't save that meeting. Please try again.",
      detail: "insert returned no rows",
    });
  }

  const row = SavedMeetingRowSchema.parse(rows[0]);

  return {
    id: row.id,
    userId: row.user_id,
    userLabel: formatUserLabel(row.fname, row.lname),
    date: row.date,
    time: row.time,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * Recent meetings for one user. Not surfaced in the UI yet; used to confirm
 * writes during verification and useful for a "recent activity" view later.
 */
const RECENT_MEETINGS_SQL = `
  SELECT
    meetings.id,
    meetings.user_id,
    users.fname,
    users.lname,
    to_char(meetings."date", 'YYYY-MM-DD') AS date,
    to_char(meetings."time", 'HH24:MI') AS time,
    meetings.description,
    to_char(meetings.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
  FROM meetings
  JOIN users ON users.id = meetings.user_id
  WHERE meetings.user_id = $1
  ORDER BY meetings.created_at DESC
  LIMIT $2
`;

export async function listRecentMeetingsForUser(
  userId: number,
  limit = 10,
): Promise<SavedMeeting[]> {
  const rows = await query(RECENT_MEETINGS_SQL, [userId, limit]);

  return rows.map((raw) => {
    const row = SavedMeetingRowSchema.parse(raw);

    return {
      id: row.id,
      userId: row.user_id,
      userLabel: formatUserLabel(row.fname, row.lname),
      date: row.date,
      time: row.time,
      description: row.description,
      createdAt: row.created_at,
    };
  });
}
