/**
 * A deterministic veto on selection, not a parser.
 *
 * Selection utterances stay in the conversation history, because the same sentence
 * may also carry criteria. That creates a hazard: on a later turn the model can see
 * "select the second one" from three messages ago and set the intent again, silently
 * re-applying a stale position to a list that has since changed.
 *
 * The prompt asks it not to. Testing showed the prompt is not reliable on its own,
 * so this gate enforces it in code: a selection is only honoured when the *newest*
 * utterance actually contains positional language.
 *
 * Note the direction. This never *causes* a selection — it only blocks one. The
 * model still decides which position was meant; a false positive here just means
 * the model's own answer is used, and the model is separately instructed that a
 * street number is not an ordinal.
 */

/** Ordinal words, in the range a visible result list could plausibly reach. */
const ORDINAL_WORDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/**
 * "last" is too common in contact talk to treat as an ordinal on its own —
 * "her last name is Perera" is criteria, not a selection. Require the noun.
 */
const LAST_PATTERN = /\blast\s+(one|result|option|entry|row)\b/;

/** Verbs and phrases that introduce a choice from a list. */
const SELECTION_VERBS = [
  "select",
  "choose",
  "pick",
  "number",
  "option",
  "go with",
  "that one",
  "the one",
];

/**
 * `1st`, `2nd`, `3rd` … `10th`, and deliberately no further.
 *
 * Capping at ten keeps day-of-month ordinals out: "September 20th 2026" is a date,
 * not a position, and a result list never runs long enough to need `20th` anyway.
 * Single-digit dates ("September 3rd") still slip through, but that only permits the
 * model's answer rather than forcing one.
 */
const ORDINAL_SUFFIX_PATTERN = /\b(?:[1-9]|10)(?:st|nd|rd|th)\b/;

/**
 * True when the utterance plausibly refers to a position in a list.
 *
 * Matched on word boundaries so "fourth" does not fire on "fourthly" and, more to
 * the point, so "selection" does not fire on unrelated substrings.
 */
export function mentionsSelection(transcript: string): boolean {
  const text = transcript.toLowerCase();

  if (ORDINAL_SUFFIX_PATTERN.test(text)) return true;
  if (LAST_PATTERN.test(text)) return true;

  for (const word of ORDINAL_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return true;
  }

  for (const phrase of SELECTION_VERBS) {
    if (new RegExp(`\\b${phrase}\\b`).test(text)) return true;
  }

  return false;
}
/**
 * Downgrades a selection the conversation cannot support.
 *
 * Two failures the prompt alone does not prevent, both observed against the live
 * model:
 *
 * 1. *Stale position.* Selection wording stays in the history, because the same
 *    sentence often carries criteria too. On a later turn the model sees "select
 *    the second one" from three messages back and sets the intent again, re-applying
 *    an old position to a list that has since changed. So a selection counts only
 *    when the newest utterance contains positional language.
 * 2. *No list.* Asked to read "select the third one" against an empty candidate
 *    list, the model still answers "selection". Nothing on screen means nothing to
 *    pick.
 *
 * Downgrading rather than throwing is deliberate: the criteria merged from the same
 * sentence are still good, and discarding a whole turn over a bad position is the
 * exact bug this design replaced.
 *
 * Pure and free of any server dependency, so the live prompt tests can apply the
 * same gate the request path does instead of asserting on raw model output.
 */
export function resolveSelectionIntent<
  T extends { intent: "criteria" | "selection"; position: number },
>(turn: T, newestTranscript: string, candidateCount: number): T {
  if (turn.intent !== "selection") return turn;

  if (candidateCount > 0 && mentionsSelection(newestTranscript)) return turn;

  return { ...turn, intent: "criteria", position: 0 };
}
