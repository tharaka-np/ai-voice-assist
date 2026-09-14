/**
 * Pure parser for Deepgram's pre-recorded response envelope.
 *
 * Split out from the HTTP adapter so the shape can be unit tested without a
 * network call or an API key:
 *
 * ```json
 * { "results": { "channels": [ { "alternatives": [ { "transcript": "..." } ] } ] } }
 * ```
 *
 * Reference: https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded
 */
export function extractDeepgramTranscript(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const results = (payload as { results?: unknown }).results;
  if (typeof results !== "object" || results === null) return null;

  const channels = (results as { channels?: unknown }).channels;
  if (!Array.isArray(channels) || channels.length === 0) return null;

  const firstChannel = channels[0];
  if (typeof firstChannel !== "object" || firstChannel === null) return null;

  const alternatives = (firstChannel as { alternatives?: unknown }).alternatives;
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null;

  const bestAlternative = alternatives[0];
  if (typeof bestAlternative !== "object" || bestAlternative === null) return null;

  const transcript = (bestAlternative as { transcript?: unknown }).transcript;
  return typeof transcript === "string" ? transcript : null;
}

/** Pulls a useful message out of a Deepgram error body for server logs. */
export function extractDeepgramErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as { err_msg?: unknown; message?: unknown; reason?: unknown };

  for (const candidate of [record.err_msg, record.message, record.reason]) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}
