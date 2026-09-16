/**
 * Tunable application limits.
 *
 * Kept in one place so a threshold change is a single edit rather than a search
 * across the codebase.
 */

/**
 * At or above this many contact matches, the flow stays in refinement mode and
 * asks the user for another identifying detail. Below it, the remaining matches
 * are shown for manual selection.
 *
 * The comparison is `matches >= MATCH_THRESHOLD`, so a threshold of 5 means five
 * matches still asks for refinement and four offers selection.
 */
export const MATCH_THRESHOLD = 3;

/**
 * Hard cap on rows returned for display. Independent of the threshold: the total
 * count is always reported accurately, but only this many rows travel to the
 * browser so a broad first turn cannot ship the whole directory.
 */
export const MAX_CONTACT_RESULTS = 25;

/**
 * Minimum trigram similarity for a fuzzy field match. Below this a match is
 * noise rather than a candidate.
 */
export const MIN_FIELD_SIMILARITY = 0.35;

/**
 * Turns kept in the conversation history sent to the extraction model.
 *
 * The whole history goes to the model on every turn, so this bounds both prompt
 * growth and the cost of a runaway session. Generous for push-to-talk, where a
 * search realistically takes two to four turns.
 *
 * When the cap is exceeded the OLDEST turns are dropped. That has a sharp edge
 * worth knowing about: a correction such as "forget the city" only holds while the
 * turn that said it is still inside the window.
 */
export const MAX_CONVERSATION_TURNS = 12;
