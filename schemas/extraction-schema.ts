import type { ZodType } from "zod";

/**
 * Shape that OpenAI Structured Outputs requires of a strict root schema: an
 * object that lists every property in `required` and forbids extra keys.
 *
 * Declared as a type alias rather than an interface on purpose. Type aliases
 * get an implicit index signature, which keeps this assignable to the OpenAI
 * SDK's `Record<string, unknown>` schema slot without a cast.
 */
export type StrictObjectJsonSchema = {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
};

/**
 * Everything the extraction pipeline needs to know about a target shape.
 *
 * The pipeline in `lib/openai/extract-structured.ts` is generic over this
 * descriptor, so swapping the meeting schema for a richer one (nested person /
 * meeting objects, action item arrays, and so on) means writing a new
 * descriptor and changing one import. No pipeline code has to change.
 */
export type ExtractionSchemaDefinition<TOutput> = {
  /** Sent to OpenAI as `json_schema.name`. Must match `^[a-zA-Z0-9_-]+$`. */
  readonly name: string;
  /** Bump whenever the shape or guidance changes. Useful for audit trails. */
  readonly version: string;
  /** Single source of truth for runtime validation of the model's output. */
  readonly zodSchema: ZodType<TOutput>;
  /** Strict JSON Schema handed to OpenAI to constrain generation. */
  readonly jsonSchema: StrictObjectJsonSchema;
  /** Field-by-field rules appended to the shared extraction system prompt. */
  readonly fieldGuidance: string;
  /**
   * Optional deterministic cleanup applied to the raw parsed JSON *before* Zod
   * validation. Use it to repair formatting the model is allowed to get
   * slightly wrong (padding `2026-9-20`, trimming whitespace, mapping the
   * literal string "unknown" to null). Never use it to invent values.
   */
  readonly normalize?: (raw: unknown) => unknown;
};

/**
 * Identity helper that pins `TOutput` to the Zod schema at the definition site,
 * so a mismatch between the declared type and the schema is a compile error.
 */
export function defineExtractionSchema<TOutput>(
  definition: ExtractionSchemaDefinition<TOutput>,
): ExtractionSchemaDefinition<TOutput> {
  return definition;
}

/**
 * A required JSON Schema string property.
 *
 * OpenAI strict mode requires every property to appear in `required`, so
 * "absent" cannot be expressed by omission. The conversational flow expresses it
 * as an empty string instead of a null, because empty is the value the merge
 * rules treat as "not stated in this turn".
 */
export function describedString(description: string) {
  return {
    type: "string",
    description,
  } as const;
}

/**
 * A required JSON Schema string constrained to a fixed set.
 *
 * Include `""` in `values` when the field is optional, for the same reason as
 * above: strict mode has no way to omit a property.
 */
export function enumString(
  description: string,
  values: readonly string[],
) {
  return {
    type: "string",
    enum: [...values],
    description,
  } as const;
}

/**
 * A required JSON Schema integer property.
 *
 * Used for a 1-based list position. Expressing "no selection" needs a sentinel
 * rather than omission, so callers should document zero as that sentinel.
 */
export function describedInteger(description: string) {
  return {
    type: "integer",
    description,
  } as const;
}

/**
 * A required nested object property.
 *
 * OpenAI strict mode applies the same rules at every level, so a nested object
 * must also list every property in `required` and forbid extras.
 */
export function nestedObject(
  description: string,
  schema: StrictObjectJsonSchema,
) {
  return { ...schema, description } as const;
}
