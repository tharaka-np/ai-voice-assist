import { NextResponse } from "next/server";

import { validateProcessAudioForm } from "@/lib/audio/validation";
import { searchContacts } from "@/lib/db/contacts";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { extractMeetingRequest } from "@/lib/openai/extract-meeting-request";
import {
  getDefaultTranscriptionProviderId,
  getTranscriptionProvider,
} from "@/lib/transcription/registry";
import { TRANSCRIPTION_PROVIDER_META } from "@/lib/transcription/types";
import { getConfiguredKeyterms } from "@/lib/transcription/vocabulary";
import { mergeConversationState } from "@/schemas/meeting-request";
import type { ProcessAudioResponse } from "@/types/api";

/**
 * One turn of a conversational contact search.
 *
 * Audio → transcript → this turn's fields → merged state → directory search.
 *
 * The turn is stateless from the model's point of view: it sees only the latest
 * transcript and returns only what that transcript stated. Accumulation happens in
 * `mergeConversationState`, which keeps the state deterministic and stops the
 * model from dropping or reinventing a value it was never shown.
 *
 * `pg` and the OpenAI SDK both need TCP sockets, which the edge runtime lacks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
): Promise<NextResponse<ProcessAudioResponse>> {
  const startedAt = Date.now();

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new AppError({
        code: "invalid_metadata",
        status: 400,
        publicMessage: "That upload wasn't readable. Please record again.",
        detail: "request body was not valid multipart/form-data",
        cause: error,
      });
    }

    // Step 1 — validate the upload, the time context, the provider choice and the
    // accumulated state echoed back from earlier turns.
    const { audio, timezone, currentDateTime, providerId, previousState } =
      validateProcessAudioForm(formData);

    // Step 2 — speech to text through the selected adapter.
    const provider = getTranscriptionProvider(
      providerId ?? getDefaultTranscriptionProviderId(),
    );
    const transcription = await provider.transcribe(audio, {
      keyterms: getConfiguredKeyterms(),
    });

    // Step 3 — extract only what this turn said. Empty strings everywhere else.
    const latestTurn = await extractMeetingRequest({
      transcript: transcription.transcript,
      currentDateTime,
      timezone,
    });

    // Step 4 — fold it into what we already knew. Empty incoming values never
    // erase an earlier answer; non-empty ones replace it.
    const state = mergeConversationState(previousState, latestTurn);

    // Step 5 — search on every populated contact field. Meeting fields are
    // excluded by construction inside `buildContactFilters`.
    const search = await searchContacts(state);

    console.info(
      `[process-audio] ok provider=${transcription.providerId} ms=${Date.now() - startedAt} bytes=${audio.size} mode=${search.mode} total=${search.total}`,
    );

    return NextResponse.json(
      {
        success: true,
        transcript: transcription.transcript,
        transcription: {
          provider: transcription.providerId,
          label: TRANSCRIPTION_PROVIDER_META[transcription.providerId].label,
          model: transcription.model,
          latencyMs: transcription.latencyMs,
          keytermCount: transcription.keytermCount,
        },
        latestTurn,
        state,
        search,
      },
      { status: 200 },
    );
  } catch (error) {
    logServerError("process-audio", error);

    const { status, message } = toPublicError(error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/** Explicit 405 so a stray GET gets a clear answer instead of a 404. */
export function GET(): NextResponse<ProcessAudioResponse> {
  return NextResponse.json(
    { success: false, error: "Use POST with multipart/form-data to process audio." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
