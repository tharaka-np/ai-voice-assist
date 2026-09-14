import { z } from "zod";

import {
  HH_MM_PATTERN,
  ISO_DATE_PATTERN,
  isRealCalendarDate,
} from "@/schemas/meeting";

/**
 * The payload a user confirms and submits.
 *
 * Distinct from `MeetingInfoSchema` in schemas/meeting.ts, and deliberately so.
 * That schema describes what the model *proposed*, where every field may be
 * null. This one describes what a human *approved*, where nothing may be:
 * `meetings.date` and `meetings.time` are NOT NULL, so a recording that never
 * stated a time has to be completed by the person before it can be saved.
 *
 * That is the "never guess" rule resolving at the human step rather than being
 * papered over with a default.
 */
export const MeetingSubmissionSchema = z.object({
  userId: z
    .number({ error: "Choose who this meeting is for" })
    .int()
    .positive("Choose who this meeting is for"),
  date: z
    .string()
    .regex(ISO_DATE_PATTERN, "Enter the date as YYYY-MM-DD")
    .refine(isRealCalendarDate, "That date doesn't exist"),
  time: z
    .string()
    .regex(HH_MM_PATTERN, "Enter the time as HH:mm on a 24-hour clock"),
  description: z
    .string()
    .trim()
    .min(1, "Add a short description of the meeting")
    .max(2000, "That description is too long"),
});

export type MeetingSubmission = z.infer<typeof MeetingSubmissionSchema>;

/**
 * Row returned after insert. Every value is cast to text in SQL rather than
 * relying on the driver's date handling, which would hand back `Date` objects
 * and reintroduce the timezone shifts we are explicitly avoiding.
 */
export const SavedMeetingRowSchema = z.object({
  id: z.number().int().positive(),
  user_id: z.number().int().positive(),
  fname: z.string().min(1),
  lname: z.string().min(1),
  date: z.string().regex(ISO_DATE_PATTERN),
  time: z.string().regex(HH_MM_PATTERN),
  description: z.string().min(1),
  created_at: z.string().min(1),
});

export type SavedMeetingRow = z.infer<typeof SavedMeetingRowSchema>;
