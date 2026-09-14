/**
 * Error model for the audio pipeline.
 *
 * Every failure carries two messages: a `publicMessage` that is safe to show a
 * user, and an optional `detail` that stays on the server. The route handler
 * only ever serialises `publicMessage`.
 */

export type AppErrorCode =
  | "audio_missing"
  | "audio_empty"
  | "audio_too_large"
  | "audio_unsupported_type"
  | "invalid_metadata"
  | "configuration_error"
  | "transcription_failed"
  | "empty_transcript"
  | "extraction_failed"
  | "invalid_model_output"
  | "database_error"
  | "not_found"
  | "rate_limited"
  | "internal_error";

type AppErrorInit = {
  code: AppErrorCode;
  status: number;
  /** Safe to render in the browser. Must not contain provider or stack detail. */
  publicMessage: string;
  /** Server-side diagnostic context. Never serialised to the client. */
  detail?: string;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly detail?: string;

  constructor(init: AppErrorInit) {
    super(init.detail ?? init.publicMessage, { cause: init.cause });
    this.name = "AppError";
    this.code = init.code;
    this.status = init.status;
    this.publicMessage = init.publicMessage;
    this.detail = init.detail;
  }
}

export const GENERIC_ERROR_MESSAGE =
  "We couldn't process the recording. Please try again.";

/**
 * Maps any thrown value to a status code and a browser-safe message. Anything
 * that is not an `AppError` is treated as an unexpected fault and collapsed to
 * a generic 500, so internal details can never leak through the API.
 */
export function toPublicError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof AppError) {
    return { status: error.status, message: error.publicMessage };
  }

  return { status: 500, message: GENERIC_ERROR_MESSAGE };
}

/**
 * Structured server-side logging. Deliberately logs codes, paths and lengths
 * rather than transcript or audio content.
 */
export function logServerError(scope: string, error: unknown): void {
  if (error instanceof AppError) {
    console.error(
      `[${scope}] ${error.code} (${error.status}): ${error.detail ?? error.publicMessage}`,
    );
    if (error.cause instanceof Error) {
      console.error(`[${scope}] cause: ${error.cause.name}: ${error.cause.message}`);
    }
    return;
  }

  console.error(`[${scope}] unhandled error`, error);
}
