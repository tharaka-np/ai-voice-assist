/**
 * The keyterm hint set: proper nouns we tell the transcription engine to expect.
 *
 * Provider-neutral on purpose. Today the list is static demo data; in a CRM
 * integration it would be a bounded set built from the current user's recently
 * viewed, recently contacted and assigned records. Only the source of the list
 * changes — everything downstream stays the same.
 *
 * Pure and free of server-only imports so the budgeting rules can be unit
 * tested without a provider key.
 */

/**
 * Deepgram documents a ceiling of 100 keyterms and recommends focusing on the
 * most important 20-50. Boosting is a trade-off: an over-long list dilutes the
 * effect and makes false positives more likely.
 */
export const KEYTERM_MAX_COUNT = 100;

/**
 * Deepgram enforces a hard 500-token cap per request and errors above it. We
 * budget to 400 because their tokeniser is not published, so the estimate below
 * is an approximation and needs headroom.
 */
export const KEYTERM_TOKEN_BUDGET = 400;

/** Placeholder vocabulary until a real record source is wired in. */
export const DEMO_KEYTERMS: readonly string[] = [
  "Amanda Wilson",
  "Tharaka Pathirana",
];

/**
 * Characters that break keyterms *silently*.
 *
 * Deepgram treats `a,b` as one literal keyterm rather than two, and reads
 * `name:0.15` as legacy weight syntax it no longer supports. Neither returns an
 * error, so the request looks fine and boosts nothing. Stripping them here means
 * a malformed entry degrades to a usable term instead of disabling the feature.
 */
const SILENTLY_BREAKING_CHARS = /[,;:]/g;

export function sanitizeKeyterm(raw: string): string {
  return raw.replace(SILENTLY_BREAKING_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Approximates how many tokens a term will cost.
 *
 * Deepgram does not publish its tokeniser, so this is a deliberately pessimistic
 * heuristic: roughly one token per four characters per word, minimum one. Longer
 * and less common names — exactly the ones worth boosting — cost more, which is
 * the behaviour we want to over- rather than under-estimate.
 */
export function estimateKeytermTokens(term: string): number {
  return term
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .reduce((total, word) => total + Math.max(1, Math.ceil(word.length / 4)), 0);
}

/** Splits an operator-supplied list. Commas are correct *here*, at our boundary. */
export function parseKeytermList(raw: string | undefined): string[] {
  if (raw === undefined) return [];

  return raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Normalises, de-duplicates and trims a hint set to fit Deepgram's limits.
 *
 * Input order is treated as priority order: once the token budget is spent we
 * stop rather than skipping ahead, so a long high-priority name is never dropped
 * in favour of a short low-priority one.
 */
export function prepareKeyterms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const prepared: string[] = [];
  let spentTokens = 0;

  for (const raw of terms) {
    if (prepared.length >= KEYTERM_MAX_COUNT) break;

    const term = sanitizeKeyterm(raw);
    if (term.length === 0) continue;

    // Case-insensitive de-duplication, but the original casing is kept: Deepgram
    // uses the capitalisation you send to shape how the name is transcribed.
    const fingerprint = term.toLowerCase();
    if (seen.has(fingerprint)) continue;

    const cost = estimateKeytermTokens(term);
    if (spentTokens + cost > KEYTERM_TOKEN_BUDGET) break;

    seen.add(fingerprint);
    prepared.push(term);
    spentTokens += cost;
  }

  return prepared;
}

/**
 * The hint set for this deployment. `TRANSCRIPTION_KEYTERMS` accepts a
 * comma-separated list so the demo vocabulary can change without a code edit.
 */
export function getConfiguredKeyterms(): string[] {
  const configured = parseKeytermList(process.env.TRANSCRIPTION_KEYTERMS);

  return prepareKeyterms(configured.length > 0 ? configured : DEMO_KEYTERMS);
}
