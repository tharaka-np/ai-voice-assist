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
}: {
  baseUrl: string;
  model: string;
  keyterms?: readonly string[];
}): URL {
  const url = new URL(baseUrl);

  url.searchParams.set("model", model);
  // Punctuation and capitalisation, so the extraction step sees text of
  // comparable quality to the OpenAI transcript.
  url.searchParams.set("smart_format", "true");

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
