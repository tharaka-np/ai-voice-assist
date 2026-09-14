import { NextResponse } from "next/server";

import { insertMeeting } from "@/lib/db/meetings";
import { requireUserById } from "@/lib/db/users";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { MeetingSubmissionSchema } from "@/schemas/meeting-submission";
import type { CreateMeetingResponse } from "@/types/api";

/**
 * Saves a meeting the user has reviewed and approved.
 *
 * This is the only write path in the app. Nothing reaches it that a person has
 * not seen and confirmed: the extraction step proposes, the user edits, and only
 * then does a row get created.
 *
 * `pg` needs TCP sockets, which the edge runtime does not provide.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
): Promise<NextResponse<CreateMeetingResponse>> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new AppError({
        code: "invalid_metadata",
        status: 400,
        publicMessage: "That request wasn't readable. Please try again.",
        detail: "request body was not valid JSON",
        cause: error,
      });
    }

    const parsed = MeetingSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      // Field-level messages are written for humans, so they are safe to show:
      // they describe the rule that failed, never the value that broke it.
      throw new AppError({
        code: "invalid_metadata",
        status: 400,
        publicMessage: parsed.error.issues
          .map((issue) => issue.message)
          .join(". "),
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "body"}(${issue.code})`)
          .join(", "),
      });
    }

    // The foreign key would reject an unknown id anyway, but checking first
    // turns a constraint violation into a clear 404 the UI can act on.
    await requireUserById(parsed.data.userId);

    const meeting = await insertMeeting(parsed.data);

    console.info(
      `[meetings] created id=${meeting.id} user=${meeting.userId} date=${meeting.date}`,
    );

    return NextResponse.json({ success: true, meeting }, { status: 201 });
  } catch (error) {
    logServerError("meetings", error);

    const { status, message } = toPublicError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/** Explicit 405 so a stray GET gets a clear answer instead of a 404. */
export function GET(): NextResponse<CreateMeetingResponse> {
  return NextResponse.json(
    { success: false, error: "Use POST with a JSON body to save a meeting." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
