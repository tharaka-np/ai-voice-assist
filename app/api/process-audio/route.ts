import { NextResponse } from "next/server";

import { validateProcessAudioForm } from "@/lib/audio/validation";
import { findContactsByIds, searchContacts } from "@/lib/db/contacts";
import { AppError, logServerError, toPublicError } from "@/lib/errors";
import { keepCarriedSelection } from "@/lib/matching/contact-match";
import { interpretConversationTurn } from "@/lib/openai/interpret-turn";
import { truncateHistory } from "@/lib/prompt/messages";
import {
  getDefaultTranscriptionProviderId,
  getTranscriptionProvider,
} from "@/lib/transcription/registry";
import { TRANSCRIPTION_PROVIDER_META } from "@/lib/transcription/types";
import { getConfiguredKeyterms } from "@/lib/transcription/vocabulary";
import type { ProcessAudioResponse, TranscriptionMeta } from "@/types/api";

/**
 * One turn of a conversational contact search.
 *
 * Every turn does the same three things: join the conversation, re-derive the
 * merged criteria from the whole history, and search. A spoken position is an
 * *additional* signal applied on top, not an alternative path.
 *
 * That matters because a sentence can be both. "Select the second one and schedule
 * a meeting for her on September 10th at 2pm" names a position *and* supplies
 * meeting details. An earlier version treated the two as mutually exclusive and
 * returned early on a selection, which silently discarded the meeting details and
 * did not even keep the utterance in history for a later turn to recover them.
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

    const {
      audio,
      timezone,
      currentDateTime,
      providerId,
      history,
      displayedContactIds,
      selectedContactId: carriedSelection,
    } = validateProcessAudioForm(formData);

    // Step 1 — speech to text through the selected adapter.
    const provider = getTranscriptionProvider(
      providerId ?? getDefaultTranscriptionProviderId(),
    );
    const transcription = await provider.transcribe(audio, {
      keyterms: getConfiguredKeyterms(),
    });

    const transcriptionMeta: TranscriptionMeta = {
      provider: transcription.providerId,
      label: TRANSCRIPTION_PROVIDER_META[transcription.providerId].label,
      model: transcription.model,
      latencyMs: transcription.latencyMs,
      keytermCount: transcription.keytermCount,
    };

    // Step 2 — the list the user is looking at, in the order they see it. A spoken
    // position refers to this, not to whatever the search returns afterwards.
    const shown = await findContactsByIds(displayedContactIds);

    // Step 3 — this turn joins the conversation unconditionally, because even a
    // sentence that names a position may also carry criteria.
    const transcripts = truncateHistory([...history, transcription.transcript]);

    const turn = await interpretConversationTurn({
      transcripts,
      currentDateTime,
      timezone,
      // Position and name only. Selection is positional, so nothing more is
      // needed, and no city, email, phone or street leaves the server.
      candidates: shown.map((contact, index) => ({
        position: index + 1,
        label: contact.label,
      })),
    });

    // Step 4 — the criteria are always used, whatever the intent was.
    const state = turn.request;
    const search = await searchContacts(state);

    // Step 5 — work out who is selected, in order of authority:
    //
    //   1. a position named in this very sentence,
    //   2. the selection already in effect, if it still matches,
    //   3. a lone remaining result, auto-selected.
    //
    // Rule 2 is what makes a selection survive. Most turns say nothing about the
    // choice — "schedule it for 4pm" names no position — and without it the answer
    // would fall through to rule 3, which is null whenever more than one row
    // matches. The user's pick would silently vanish one turn after they made it.
    let selectedContactId =
      keepCarriedSelection(carriedSelection, search.contacts) ??
      search.selectedContactId;
    let selectedPosition: number | null = null;
    let selectionWarning: string | null = null;

    // `interpretConversationTurn` has already vetoed selections the conversation
    // cannot support (wording from an older turn, or no list on screen), so an
    // intent of "selection" here means a position was genuinely named just now.
    // What remains is whether that position still points at a real match.
    if (turn.intent === "selection") {
      const chosen = shown[turn.position - 1];

      if (chosen === undefined) {
        // A warning, not an error. The same sentence may have carried perfectly
        // good criteria, and failing the turn would throw those away too — which
        // is the exact bug this rewrite exists to fix.
        selectionWarning =
          shown.length === 1
            ? `There was only one match, so position ${turn.position} did not apply.`
            : `There were only ${shown.length} matches, so position ${turn.position} did not apply.`;
      } else if (!search.contacts.some((contact) => contact.id === chosen.id)) {
        // The same sentence narrowed the search past the person it pointed at.
        selectionWarning = `${chosen.label} is no longer among the matches, so that choice was not applied.`;
      } else {
        selectedContactId = chosen.id;
        selectedPosition = turn.position;
      }
    } else if (carriedSelection !== null && selectedContactId !== carriedSelection) {
      // The selection was dropped, not by anything the user said about it, but
      // because this turn's criteria narrowed the list past that person. Say so —
      // silently losing a pick is what made this hard to notice in the first place.
      const previous = shown.find((contact) => contact.id === carriedSelection);

      selectionWarning =
        previous === undefined
          ? "Your earlier choice is no longer among the matches."
          : `${previous.label} is no longer among the matches, so that choice was cleared.`;
    }

    console.info(
      `[process-audio] provider=${transcription.providerId} intent=${turn.intent} turns=${transcripts.length} ms=${Date.now() - startedAt} mode=${search.mode} total=${search.total} selected=${selectedContactId ?? "none"}`,
    );

    return NextResponse.json(
      {
        success: true,
        transcript: transcription.transcript,
        transcripts,
        transcription: transcriptionMeta,
        state,
        search,
        selectedContactId,
        selectedPosition,
        selectionWarning,
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
