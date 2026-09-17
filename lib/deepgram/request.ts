/**
 * Pure request construction for Deepgram's pre-recorded endpoint.
 *
 * Split from the HTTP adapter so the query string — the part with the
 * easy-to-get-wrong keyterm syntax — can be asserted in a unit test without a
 * network call or an API key.
 *
 * Reference: https://developers.deepgram.com/docs/keyterm
 */
export function buildListenUrl({
  baseUrl,
  model,
  keyterms = [],
  language,
}: {
  baseUrl: string;
  model: string;
  keyterms?: readonly string[];
  /**
   * Pins the language, disabling automatic detection.
   *
   * Optional, and omitted from the query when absent. Deepgram already defaults to
   * English, so leaving it out is harmless — but sending it makes the choice a
   * property of this application rather than something inherited from a vendor
   * default that could change.
   */
  language?: string;
}): URL {
  const url = new URL(baseUrl);

  url.searchParams.set("model", model);
  // Punctuation and capitalisation, so the extraction step sees text of
  // comparable quality to the OpenAI transcript.
  url.searchParams.set("smart_format", "true");

  // With a language set, Deepgram transcribes only that language rather than
  // detecting one. Safe alongside keyterms: keyterm prompting works on Nova-3 in
  // both monolingual and multilingual modes.
  if (language !== undefined) {
    url.searchParams.set("language", language);
  }

  // `append`, never `set`: each keyterm is its own repeated parameter. Using
  // `set` would overwrite, leaving only the last term. Separating terms with a
  // comma would be accepted and silently boost nothing.
  //
  // URLSearchParams handles the encoding, so "Amanda Wilson" is sent as
  // "Amanda+Wilson" — a valid encoded space in a query parameter.
  for (const term of keyterms) {
    url.searchParams.append("keyterm", term);
  }

  return url;
}
