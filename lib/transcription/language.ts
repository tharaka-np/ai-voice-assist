/**
 * The language we tell the transcription engines to expect.
 *
 * Provider-neutral and free of server-only imports, so the validation can be unit
 * tested without a provider key — the same arrangement as `vocabulary.ts`.
 *
 * ## Why this exists
 *
 * Neither adapter used to declare a language, so both engines ran automatic
 * language identification and transcribed in whatever they picked. That is fine on
 * a long, clean recording and unreliable on the short ones this app is built
 * around: a one-second clip like "Find Tharaka" gives language ID almost nothing to
 * work from, and an unusual proper noun tilts it further. The observed failure was
 * a transcript of `فائنڈ تارک` — the right sounds in the wrong alphabet.
 *
 * Extraction then did its job correctly and returned `fname: "تارک"`, which matches
 * no database row. So the visible symptom was "no matching contacts found", blaming
 * the directory for a transcription fault.
 *
 * Pinning the language removes the decision rather than trying to correct it
 * afterwards. Transliterating the output cannot help: `تارک` reverses to "Tarak",
 * not "Tharaka", so the search would still fail.
 */

import { AppError } from "@/lib/errors";

/**
 * English by default, because that is what the seeded directory and the keyterm
 * demo vocabulary are in. Overridable so a demo in another locale does not need a
 * code change.
 */
export const DEFAULT_TRANSCRIPTION_LANGUAGE = "en";

/**
 * ISO 639-1: exactly two lowercase letters.
 *
 * Deliberately narrower than either vendor accepts. Deepgram also takes regional
 * tags like `en-US` and a `multi` mode, but OpenAI's transcription endpoint expects
 * ISO 639-1, so the intersection is what one shared setting can safely mean. A
 * regional tag here would work on one engine and be wrong on the other, which is
 * worse than not offering it.
 */
const ISO_639_1 = /^[a-z]{2}$/;

/**
 * Reads and validates the configured language.
 *
 * Throws rather than falling back on a malformed value. A silent fallback would
 * turn a typo like `eng` into a vendor-side rejection surfacing as a generic
 * "couldn't transcribe that recording", sending whoever set it looking at the audio
 * instead of the environment. This mirrors `getDeepgramApiKey`, which also treats a
 * misconfiguration as a `configuration_error` rather than a runtime surprise.
 */
export function getTranscriptionLanguage(): string {
  const configured = process.env.TRANSCRIPTION_LANGUAGE?.trim();

  if (configured === undefined || configured.length === 0) {
    return DEFAULT_TRANSCRIPTION_LANGUAGE;
  }

  const normalized = configured.toLowerCase();

  if (!ISO_639_1.test(normalized)) {
    throw new AppError({
      code: "configuration_error",
      status: 500,
      publicMessage:
        "This server's transcription language is misconfigured. Please contact the administrator.",
      detail:
        `TRANSCRIPTION_LANGUAGE must be a two-letter ISO 639-1 code such as 'en', got '${configured}'. ` +
        "Unset it to use the default.",
    });
  }

  return normalized;
}
