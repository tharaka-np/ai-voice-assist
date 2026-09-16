import { NextResponse } from "next/server";

import { validateProcessAudioForm } from "@/lib/audio/validation";
import { searchContacts } from "@/lib/db/contacts";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { extractMeetingRequest } from "@/lib/openai/extract-meeting-request";
import { truncateHistory } from "@/lib/prompt/messages";
import {
  getDefaultTranscriptionProviderId,
  getTranscriptionProvider,
} from "@/lib/transcription/registry";
import { TRANSCRIPTION_PROVIDER_META } from "@/lib/transcription/types";
import { getConfiguredKeyterms } from "@/lib/transcription/vocabulary";
import type { ProcessAudioResponse } from "@/types/api";

/**
 * One turn of a conversational contact search.
 *
 * Audio → transcript → append to history → extract from the WHOLE history →
 * directory search.
 *
 * The model performs the merge. It receives every transcript in the conversation
 * and returns the complete picture as of the latest message, so there is no
 * application-side merge and nothing but transcripts is carried between turns.
 *
 * The trade that buys: spoken corrections and replacements work naturally, at the
 * cost of determinism. Zod validation of the model's response is therefore the
 * only guard left before this data reaches the database.
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
    // transcript history echoed back from earlier turns.
    const { audio, timezone, currentDateTime, providerId, history } =
      validateProcessAudioForm(formData);

    // Step 2 — speech to text through the selected adapter.
    const provider = getTranscriptionProvider(
      providerId ?? getDefaultTranscriptionProviderId(),
    );
    const transcription = await provider.transcribe(audio, {
      keyterms: getConfiguredKeyterms(),
    });

    // Step 3 — this turn joins the conversation. Truncated here as well as in the
    // prompt builder, so the array returned to the client cannot grow forever.
    const transcripts = truncateHistory([...history, transcription.transcript]);

    // Step 4 — the model reads the whole conversation and returns the merged
    // state. A field nobody mentioned comes back empty; a field mentioned twice
    // takes its latest value.
    const state = await extractMeetingRequest({
      transcripts,
      currentDateTime,
      timezone,
    });

    // Step 5 — search on every populated contact field. Meeting fields are
    // excluded by construction inside `buildContactFilters`.
    const search = await searchContacts(state);

    console.info(
      `[process-audio] ok provider=${transcription.providerId} turns=${transcripts.length} ms=${Date.now() - startedAt} mode=${search.mode} total=${search.total}`,
    );

    return NextResponse.json(
      {
        success: true,
        transcript: transcription.transcript,
        transcripts,
        transcription: {
          provider: transcription.providerId,
          label: TRANSCRIPTION_PROVIDER_META[transcription.providerId].label,
          model: transcription.model,
          latencyMs: transcription.latencyMs,
          keytermCount: transcription.keytermCount,
        },
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
