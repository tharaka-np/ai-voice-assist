import { describe, expect, it } from "vitest";
import OpenAI from "openai";

import { buildExtractionMessages } from "@/lib/prompt/messages";
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
