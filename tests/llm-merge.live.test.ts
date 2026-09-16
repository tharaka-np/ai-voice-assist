import { describe, expect, it } from "vitest";
import OpenAI from "openai";

import { resolveSelectionIntent } from "@/lib/matching/selection-cue";
import { buildExtractionMessages } from "@/lib/prompt/messages";
import {
  conversationTurnExtractionSchema,
  conversationTurnSchema,
  normalizeConversationTurn,
  type ConversationTurn,
} from "@/schemas/conversation-turn";
import {
  meetingRequestExtractionSchema,
  meetingRequestSchema,
  normalizeMeetingRequest,
  type MeetingRequest,
} from "@/schemas/meeting-request";

/**
 * Live merge checks. Opt-in, because they cost money and hit the network.
 *
 *   set -a; . ./.env.local; set +a; RUN_LIVE_LLM_TESTS=1 npm test
 *   # or: npm run test:live
 *
 * These exist because the merge moved into the model. `mergeConversationState`
 * used to make these assertions in microseconds with no network; now the only way
 * to know the merging still works is to ask the model. Skipped by default so
 * `npm test` stays free and offline.
 *
 * Treat a failure here as a prompt regression, not a flake — but do re-run before
 * concluding that, since the output is no longer deterministic.
 */

const isEnabled = process.env.RUN_LIVE_LLM_TESTS === "1";

const CURRENT_DATE_TIME = "2026-09-09T17:20:00+05:30";
const TIMEZONE = "Asia/Colombo";

async function extract(transcripts: string[]): Promise<MeetingRequest> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1-mini",
    temperature: 0,
    messages: buildExtractionMessages({
      fieldGuidance: meetingRequestExtractionSchema.fieldGuidance,
      transcripts,
      currentDateTime: CURRENT_DATE_TIME,
      timezone: TIMEZONE,
    }),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: meetingRequestExtractionSchema.name,
        strict: true,
        schema: meetingRequestExtractionSchema.jsonSchema,
      },
    },
  });

  const raw: unknown = JSON.parse(
    completion.choices[0]?.message.content ?? "{}",
  );

  return meetingRequestSchema.parse(normalizeMeetingRequest(raw));
}

describe.skipIf(!isEnabled)("live LLM merging", () => {
  it("turn 1 extracts only what was said", async () => {
    const state = await extract(["Find Tharaka"]);

    expect(state.fname).toBe("Tharaka");
    expect(state.city).toBe("");
    expect(state.lname).toBe("");
  }, 60_000);

  it("turn 2 keeps a name that was not repeated", async () => {
    // The behaviour the whole design rests on: silence is not a deletion.
    const state = await extract(["Find Tharaka", "He lives in Colombo"]);

    expect(state.fname).toBe("Tharaka");
    expect(state.city).toBe("Colombo");
  }, 60_000);

  it("turn 3 accumulates across the whole conversation", async () => {
    const state = await extract([
      "Find Tharaka. Schedule a meeting on September 20th 2026 at 2 PM to discuss the Spice CRM release.",
      "He lives in Colombo",
      "His last name is Perera",
    ]);

    expect(state.fname).toBe("Tharaka");
    expect(state.lname).toBe("Perera");
    expect(state.city).toBe("Colombo");
    expect(state.meetingDate).toBe("2026-09-20");
    expect(state.meetingTime).toBe("14:00");
  }, 60_000);

  it("a later message replaces the person but keeps the meeting", async () => {
    const state = await extract([
      "Find Amanda in Austin. Schedule a meeting October 10th 2026 at 3 PM to plan the decoration.",
      "Actually, find Eric Poe instead. His email is eric.poe@example.com",
    ]);

    expect(state.fname).toBe("Eric");
    expect(state.lname).toBe("Poe");
    expect(state.email).toBe("eric.poe@example.com");
    expect(state.meetingDate).toBe("2026-10-10");
    expect(state.meetingTime).toBe("15:00");
    // Austin was never replaced, so it survives. See the README note on the
    // dead-end this can create.
    expect(state.city).toBe("Austin");
  }, 60_000);

  it("does not infer gender from a first name", async () => {
    const state = await extract(["Find Amanda Wilson"]);

    expect(state.fname).toBe("Amanda");
    expect(state.gender).toBe("");
  }, 60_000);

  it("sets gender only when stated outright", async () => {
    const state = await extract(["Find Alex. She is female."]);

    expect(state.gender).toBe("female");
  }, 60_000);
});

/**
 * Selection intent. Non-deterministic, so it lives here rather than in the unit
 * suite. These are the assertions that matter most: a false positive silently
 * picks the wrong person.
 */
const SHOWN = [
  { position: 1, label: "Tharaka Perera" },
  { position: 2, label: "Tharaka Silva" },
  { position: 3, label: "Tharaka Fernando" },
  { position: 4, label: "Tharaka Mendis" },
];

async function interpret(
  transcripts: string[],
  candidates = SHOWN,
): Promise<ConversationTurn> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4.1-mini",
    temperature: 0,
    messages: buildExtractionMessages({
      fieldGuidance: conversationTurnExtractionSchema.fieldGuidance,
      transcripts,
      currentDateTime: CURRENT_DATE_TIME,
      timezone: TIMEZONE,
      candidates,
    }),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: conversationTurnExtractionSchema.name,
        strict: true,
        schema: conversationTurnExtractionSchema.jsonSchema,
      },
    },
  });

  const raw: unknown = JSON.parse(
    completion.choices[0]?.message.content ?? "{}",
  );

  const turn = conversationTurnSchema.parse(normalizeConversationTurn(raw));

  // The same veto the request path applies. Without it these tests would assert on
  // raw model output, which is not what any caller ever sees.
  return resolveSelectionIntent(
    turn,
    transcripts.at(-1) ?? "",
    candidates.length,
  );
}

describe.skipIf(!isEnabled)("live selection intent", () => {
  it("reads an ordinal as a selection", async () => {
    const turn = await interpret(["Find Tharaka", "select the third one"]);

    expect(turn.intent).toBe("selection");
    expect(turn.position).toBe(3);
  }, 60_000);

  it("reads a bare number as a selection", async () => {
    const turn = await interpret(["Find Tharaka", "number two"]);

    expect(turn.intent).toBe("selection");
    expect(turn.position).toBe(2);
  }, 60_000);

  // Deliberately not asserted: "I meant Silva". The model reads that as criteria
  // (lname = Silva), which is a legitimate reading and reaches the same person by
  // re-searching down to one result. An utterance that is valid as either is not a
  // useful assertion about intent.

  it('resolves "the last one"', async () => {
    const turn = await interpret(["Find Tharaka", "the last one"]);

    expect(turn.intent).toBe("selection");
    expect(turn.position).toBe(4);
  }, 60_000);

  it("handles a sentence that both selects and supplies meeting details", async () => {
    // The reported bug: this returned the selection and silently dropped the date
    // and time, because intent was modelled as either/or.
    const turn = await interpret([
      "Find Tharaka",
      "Select the second one and schedule a meeting for her on September 10, 2026 at 2 p.m.",
    ]);

    expect(turn.intent).toBe("selection");
    expect(turn.position).toBe(2);
    // The half that used to be thrown away.
    expect(turn.request.meetingDate).toBe("2026-09-10");
    expect(turn.request.meetingTime).toBe("14:00");
  }, 60_000);

  it("keeps the earlier name when a compound sentence selects", async () => {
    const turn = await interpret([
      "Find Tharaka in Colombo",
      "select the first one and set it for tomorrow at 9am",
    ]);

    expect(turn.intent).toBe("selection");
    expect(turn.position).toBe(1);
    expect(turn.request.fname).toBe("Tharaka");
    expect(turn.request.city).toBe("Colombo");
    expect(turn.request.meetingTime).toBe("09:00");
  }, 60_000);

  it("does not re-select from an earlier turn's selection wording", async () => {
    // Selection utterances now stay in history, so only the final message may set
    // the intent. Otherwise a later turn would silently re-apply an old position
    // against a list that has since changed.
    const turn = await interpret([
      "Find Tharaka",
      "select the second one",
      "actually make it 3pm",
    ]);

    expect(turn.intent).toBe("criteria");
    expect(turn.request.meetingTime).toBe("15:00");
  }, 60_000);

  it("treats added detail as criteria, not a selection", async () => {
    const turn = await interpret(["Find Tharaka", "he lives in Kandy"]);

    expect(turn.intent).toBe("criteria");
    expect(turn.request.city).toBe("Kandy");
  }, 60_000);

  it("does not mistake a street number for an ordinal", async () => {
    // The false positive that would silently pick the wrong person.
    const turn = await interpret(["Find Tharaka", "she lives on 3rd Street"]);

    expect(turn.intent).toBe("criteria");
    expect(turn.position).toBe(0);
  }, 60_000);

  it("treats a descriptive choice as criteria, not a selection", async () => {
    // Selection is positional only. "the Galle one" is a search detail, and
    // narrowing on it reaches the same person: city = Galle leaves one result,
    // and a single result is preselected automatically.
    const turn = await interpret(["Find Tharaka", "the Galle one"]);

    expect(turn.intent).toBe("criteria");
    expect(turn.position).toBe(0);
    expect(turn.request.city.toLowerCase()).toContain("galle");
  }, 60_000);

  it("treats an ambiguous description as criteria", async () => {
    const turn = await interpret(["Find Tharaka", "the Colombo one"]);

    expect(turn.intent).toBe("criteria");
    expect(turn.position).toBe(0);
  }, 60_000);

  // Deliberately not asserted: "select the third one" with an empty list. The model
  // still answers "selection" because the sentence plainly is one, and no prompt
  // wording reliably suppresses that. The guard is in the route instead —
  // `turn.intent === "selection" && shown.length > 0` — so the model's answer is
  // ignored when there is nothing to select. Enforcing that in code rather than in
  // the prompt is the right place for it.
});
