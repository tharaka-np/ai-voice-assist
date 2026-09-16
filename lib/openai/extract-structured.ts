import "server-only";

import { AppError } from "@/lib/errors";
import { getExtractionModel, getOpenAIClient } from "@/lib/openai/client";
import { buildExtractionMessages } from "@/lib/prompt/messages";
import type { ExtractionSchemaDefinition } from "@/schemas/extraction-schema";

export type ExtractionContext = {
  /**
   * Every transcript in the conversation, oldest first, latest last.
   *
   * The whole history goes to the model on each turn and the model returns the
   * merged result. There is no application-side merge behind this, so an omitted
   * turn is genuinely forgotten.
   */
  transcripts: readonly string[];
  /** ISO 8601 timestamp with offset, e.g. `2026-09-09T17:20:00+05:30`. */
  currentDateTime: string;
  /** IANA identifier, e.g. `Asia/Colombo`. */
  timezone: string;
};

/**
 * Runs one schema-constrained extraction pass over the whole conversation and
 * validates the result.
 *
 * Generic over the schema descriptor so swapping in a richer shape requires no
 * change here. Two independent guards still apply: OpenAI Structured Outputs
 * constrains the response shape, and Zod validates what actually came back.
 *
 * What changed with conversation history: the model now performs the merge, so
 * the *shape* of the response is still guaranteed but the *values* are no longer
 * deterministic. Zod remains the only thing standing between a model response and
 * the database.
 */
export async function extractStructured<TOutput>(
  definition: ExtractionSchemaDefinition<TOutput>,
  context: ExtractionContext,
): Promise<TOutput> {
  const client = getOpenAIClient();
  const model = getExtractionModel();
  const startedAt = Date.now();

  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: buildExtractionMessages({
        fieldGuidance: definition.fieldGuidance,
        transcripts: context.transcripts,
        currentDateTime: context.currentDateTime,
        timezone: context.timezone,
      }),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: definition.name,
          strict: true,
          schema: definition.jsonSchema,
        },
      },
    });
  } catch (error) {
    throw new AppError({
      code: "extraction_failed",
      status: 502,
      publicMessage:
        "We transcribed your recording but couldn't pull the details out of it. Please try again.",
      detail: `extraction request failed for model '${model}', schema '${definition.name}@${definition.version}'`,
      cause: error,
    });
  }

  const message = completion.choices[0]?.message;

  if (message?.refusal) {
    throw new AppError({
      code: "extraction_failed",
      status: 422,
      publicMessage:
        "We couldn't extract information from that recording. Please try rephrasing it.",
      detail: "model returned a refusal",
    });
  }

  const content = message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AppError({
      code: "invalid_model_output",
      status: 502,
      publicMessage:
        "We transcribed your recording but couldn't pull the details out of it. Please try again.",
      detail: `model '${model}' returned no content (finish_reason=${completion.choices[0]?.finish_reason ?? "unknown"})`,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new AppError({
      code: "invalid_model_output",
      status: 502,
      publicMessage:
        "We transcribed your recording but couldn't pull the details out of it. Please try again.",
      detail: "model output was not valid JSON",
      cause: error,
    });
  }

  const normalized = definition.normalize ? definition.normalize(parsed) : parsed;
  const result = definition.zodSchema.safeParse(normalized);

  if (!result.success) {
    // Log field paths and rule names only. Never log the offending values,
    // which would put transcript content into the logs.
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}(${issue.code})`)
      .join(", ");

    throw new AppError({
      code: "invalid_model_output",
      status: 502,
      publicMessage:
        "We transcribed your recording but the extracted details didn't look right. Please try again.",
      detail: `schema '${definition.name}@${definition.version}' validation failed: ${issues}`,
    });
  }

  console.info(
    `[extract] model=${model} schema=${definition.name}@${definition.version} ms=${Date.now() - startedAt}`,
  );

  return result.data;
}
