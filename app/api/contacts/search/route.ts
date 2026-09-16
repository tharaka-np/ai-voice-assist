import { NextResponse } from "next/server";

import { searchContacts } from "@/lib/db/contacts";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { meetingRequestSchema } from "@/schemas/meeting-request";
import type { ContactSearchResponse } from "@/types/api";

/**
 * Reruns the directory search for a state the user edited directly.
 *
 * Exists so removing a mis-heard criterion chip does not require speaking again.
 * Takes the whole state rather than a query string because the search spans eight
 * fields, and takes it as a POST body rather than query parameters because a
 * street address or an email in a URL is needlessly leaky.
 *
 * `pg` needs TCP sockets, which the edge runtime does not provide.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
): Promise<NextResponse<ContactSearchResponse>> {
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

    // Every field defaults to an empty string, so a partial body is valid and
    // means "no filter for the fields you left out".
    const parsed = meetingRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new AppError({
        code: "invalid_metadata",
        status: 400,
        publicMessage: "Those search details weren't valid. Please try again.",
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "body"}(${issue.code})`)
          .join(", "),
      });
    }

    const state = parsed.data;
    const search = await searchContacts(state);

    console.info(
      `[contacts-search] mode=${search.mode} total=${search.total}`,
    );

    return NextResponse.json({ success: true, state, search }, { status: 200 });
  } catch (error) {
    logServerError("contacts-search", error);

    const { status, message } = toPublicError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/** Explicit 405 so a stray GET gets a clear answer instead of a 404. */
export function GET(): NextResponse<ContactSearchResponse> {
  return NextResponse.json(
    { success: false, error: "Use POST with a JSON body to search contacts." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
