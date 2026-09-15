import { NextResponse } from "next/server";

import { validateProcessAudioForm } from "@/lib/audio/validation";
import { searchUsersByName } from "@/lib/db/users";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { extractMeetingInfo } from "@/lib/openai/extract-meeting-info";
import {
  getDefaultTranscriptionProviderId,
  getTranscriptionProvider,
} from "@/lib/transcription/registry";
import { TRANSCRIPTION_PROVIDER_META } from "@/lib/transcription/types";
import { getConfiguredKeyterms } from "@/lib/transcription/vocabulary";
import type { ProcessAudioResponse } from "@/types/api";

/**
 * Audio → transcript → structured data.
 *
 * The browser never talks to a provider: this handler is the only place
 * credentials exist. It stays thin on purpose, delegating validation to
 * `lib/audio/validation`, transcription to whichever adapter the caller
 * selected, and extraction to `lib/openai/extract-meeting-info`.
 */

// Uses the Node.js runtime: the OpenAI SDK's file upload path and `File`
// handling are exercised far more widely there than on the edge runtime.
export const runtime = "nodejs";

// Nothing here is cacheable; every request carries a unique recording.
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

    // Step 1 — validate the upload, the time context and the provider choice.
    const { audio, timezone, currentDateTime, providerId } =
      validateProcessAudioForm(formData);

    // Step 2 — speech to text through the selected adapter. Resolved by id, so
    // the handler has no knowledge of any specific vendor.
    const provider = getTranscriptionProvider(
      providerId ?? getDefaultTranscriptionProviderId(),
    );

    // Proper-noun hints are assembled by the caller, not the adapter, because in
    // a CRM integration this is where a per-user record lookup would happen.
    // Adapters without an equivalent feature ignore the option.
    const transcription = await provider.transcribe(audio, {
      keyterms: getConfiguredKeyterms(),
    });

    // Step 3 — schema-constrained extraction, validated with Zod before it is
    // allowed anywhere near the response.
    const data = await extractMeetingInfo({
      transcript: transcription.transcript,
      currentDateTime,
      timezone,
    });

    // Step 4 — resolve the extracted name against the directory. The model
    // supplies a name string only; the database is the sole authority on which
    // record that maps to, and ambiguity is handed back to the user rather than
    // guessed at here.
    const nameMatch =
      data.name === null
        ? { status: "unresolved" as const, selectedUserId: null, candidates: [] }
        : await searchUsersByName(data.name);

    console.info(
      `[process-audio] ok provider=${transcription.providerId} ms=${Date.now() - startedAt} bytes=${audio.size}`,
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
        data,
        nameMatch: { ...nameMatch, searchedFor: data.name },
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
