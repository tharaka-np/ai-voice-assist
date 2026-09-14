import { NextResponse } from "next/server";

import { searchUsersByName } from "@/lib/db/users";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { UserSearchQuerySchema } from "@/schemas/user";
import type { UserSearchResponse } from "@/types/api";

/**
 * Manual name lookup, used when the automatic match is wrong or absent.
 *
 * `pg` needs TCP sockets, which the edge runtime does not provide.
 */
export const runtime = "nodejs";

/**
 * Reading `searchParams` already opts out of static generation, but this is
 * explicit: a cached search endpoint would quietly return stale people.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
): Promise<NextResponse<UserSearchResponse>> {
  try {
    const term = new URL(request.url).searchParams.get("q");
    const parsed = UserSearchQuerySchema.safeParse({ q: term });

    if (!parsed.success) {
      throw new AppError({
        code: "invalid_metadata",
        status: 400,
        publicMessage: "Enter a name to search for.",
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "q"}: ${issue.message}`)
          .join("; "),
      });
    }

    const resolution = await searchUsersByName(parsed.data.q);

    return NextResponse.json(
      {
        success: true,
        status: resolution.status,
        selectedUserId: resolution.selectedUserId,
        candidates: resolution.candidates,
      },
      { status: 200 },
    );
  } catch (error) {
    logServerError("users-search", error);

    const { status, message } = toPublicError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
